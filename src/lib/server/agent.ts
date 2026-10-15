import { and, isNull, lt, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { events, users } from '#lib/server/db/schema.js';
import { prune, react, watch } from '#lib/core/agent.js';
import { LIMITS } from '#lib/guardrails.js';
import { serverCtx, setReactor } from '#lib/server/ctx.js';
import { syncCalendars, syncedUsers } from '#lib/server/calendar.js';
import { fireAllDue } from '#lib/server/schedule.js';

const TICK_MS = 15_000;

/** One reaction for an account: its rows, its key, its open tabs. */
async function reactFor(email: string) {
	const [user] = await db.select().from(users).where(eq(users.email, email));
	if (!user) return;
	const { email: _email, ...settings } = user;
	await react(serverCtx(email, user.openaiKey), settings);
}

/** Events within a few seconds of each other become one reaction, a dragged task is one event burst, not twenty. */
const waiting = new Map<string, ReturnType<typeof setTimeout>>();

function reactSoon(email: string) {
	clearTimeout(waiting.get(email));
	waiting.set(
		email,
		setTimeout(() => {
			waiting.delete(email);
			reactFor(email).catch((error) => console.error('[agent] reaction failed', error));
		}, LIMITS.coalesceMs)
	);
}

let lastPrune = 0;
let lastCalendar = 0;
const CALENDAR_SYNC_MS = 5 * 60_000;

/** Follows the calendars of everyone who imported one. A user whose grant was dropped is unlinked by the sync. */
async function syncCalendarsOfEveryone() {
	for (const email of syncedUsers())
		await syncCalendars(email, Date.now()).catch((error) =>
			console.error('[agent] calendar sync failed for a user', error)
		);
}

async function tick() {
	await fireAllDue().catch((error) => console.error('[agent] firing the schedule failed', error));
	const everyone = await db.select().from(users);
	for (const { email, ...settings } of everyone)
		await watch(serverCtx(email), settings).catch((error) =>
			console.error('[agent] watch failed for a user', error)
		);

	// Safety net for events nobody is waiting on, for example after a restart
	const stuck = await db
		.selectDistinct({ email: events.email })
		.from(events)
		.where(and(isNull(events.handledAt), lt(events.createdAt, Date.now() - LIMITS.coalesceMs * 2)));
	for (const { email } of stuck)
		if (!waiting.has(email))
			await reactFor(email).catch((error) => console.error('[agent] reaction failed', error));

	// Not awaited: a slow Google must not hold up alarms and reactions
	if (Date.now() - lastCalendar > CALENDAR_SYNC_MS) {
		lastCalendar = Date.now();
		void syncCalendarsOfEveryone();
	}

	if (Date.now() - lastPrune > 3_600_000) {
		lastPrune = Date.now();
		for (const { email } of everyone) await prune(serverCtx(email));
	}
}

/** Starts the scheduler once per process, also across hot reloads in development. */
export function startAgent() {
	const state = globalThis as { __taskerAgent?: ReturnType<typeof setInterval> };
	if (state.__taskerAgent) clearInterval(state.__taskerAgent);
	setReactor(reactSoon);

	let running = false;
	async function run() {
		if (running) return;
		running = true;
		try {
			await tick();
		} catch (error) {
			console.error('[agent] tick failed', error);
		} finally {
			running = false;
		}
	}
	state.__taskerAgent = setInterval(() => void run(), TICK_MS);
}
