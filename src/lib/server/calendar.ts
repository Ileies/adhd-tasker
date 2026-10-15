/**
 * Reading Google Calendar into the plan (local first plan 6.2). Linking first previews, and nothing in the plan or
 * in Google changes until the user chose how to import (D9). After that a sync every few minutes follows what
 * Google has in the next 14 days. The app never writes to Google here. The rules are in `#lib/core/calendar.ts`.
 */
import { error } from '@sveltejs/kit';
import { and, eq, gte, inArray } from 'drizzle-orm';
import {
	clashesWith,
	datesOf,
	mapEvent,
	piecesToTasks,
	planSync,
	previewImport,
	windowFor,
	windowInstants,
	type AllDayLine,
	type CalendarImport,
	type CalendarState,
	type Fetched,
	type ImportMode,
	type KnownEvent,
	type Mapped,
	type PlanSlot,
	type Preview
} from '#lib/core/calendar.js';
import { db } from '#lib/server/db/index.js';
import { calendarEvents, calendarSync, tasks, users } from '#lib/server/db/schema.js';
import { GoogleAuthError, listEvents } from '#lib/server/google-calendar.js';
import { forgetGoogle, hasRefreshToken } from '#lib/server/google-tokens.js';
import { parseServices } from '#lib/google.js';
import { todayIn } from '#lib/time.js';

/** Most calendars one user can read, a guard against a request that asks for hundreds. */
export const MAX_CALENDARS = 20;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Timed = Extract<Mapped, { kind: 'timed' }>;

/** Where the user's day is: the timezone saved with the account, UTC until one is. */
function clockOf(email: string, now: number) {
	const user = db.select().from(users).where(eq(users.email, email)).get();
	const timezone = user?.timezone ?? 'UTC';
	return { timezone, today: todayIn(timezone, new Date(now)) };
}

export function calendarState(email: string): CalendarState {
	const row = db.select().from(calendarSync).where(eq(calendarSync.email, email)).get();
	return row
		? { status: row.status, calendars: row.calendars, syncedAt: row.syncedAt }
		: { status: 'none', calendars: [], syncedAt: null };
}

/** Everything the calendars have in the window, mapped to what the app makes of it. */
async function fetchAll(email: string, now: number, calendars: string[]) {
	const { timezone, today } = clockOf(email, now);
	const window = windowFor(today);
	const instants = windowInstants(today, timezone);
	const fetched: Fetched[] = [];
	for (const calendarId of calendars)
		for (const event of await listEvents(email, now, calendarId, instants))
			fetched.push({ calendarId, event, mapped: mapEvent(event, timezone) });
	return { fetched, window };
}

/** What the plan has from today on, for clashes. */
function planFrom(email: string, from: string, tx: Pick<typeof db, 'select'> = db): PlanSlot[] {
	return tx
		.select()
		.from(tasks)
		.where(and(eq(tasks.email, email), gte(tasks.date, from)))
		.all();
}

/** A failure that means the grant is gone ends the link, so the user is asked to link again. */
async function guarded<T>(email: string, work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof GoogleAuthError) forgetGoogle(email);
		throw error;
	}
}

/**
 * The first look at the chosen calendars: what is coming and how much of it clashes with the plan. Writes
 * the choice of calendars and nothing else, the plan and Google stay as they are.
 */
export async function previewCalendars(
	email: string,
	calendars: string[],
	now: number
): Promise<Preview | null> {
	// Followed calendars are changed by stopping first, a new first import would bring every event in twice
	if (calendarState(email).status === 'active') return null;
	return guarded(email, async () => {
		const { fetched, window } = await fetchAll(email, now, calendars);
		const preview = previewImport(fetched, planFrom(email, window.from), window);
		db.insert(calendarSync)
			.values({ email, calendars, status: 'preview', createdAt: now })
			.onConflictDoUpdate({
				target: calendarSync.email,
				set: { calendars, status: 'preview', syncedAt: null }
			})
			.run();
		return preview;
	});
}

/** Tasks for the pieces of an event that are today or later, the days before are history. */
function insertEvent(tx: Tx, email: string, from: string, item: Fetched, makeTasks: boolean) {
	const { mapped, event, calendarId } = item;
	let taskIds: number[] = [];
	if (mapped.kind === 'timed' && makeTasks) {
		const kept: Timed = { ...mapped, pieces: mapped.pieces.filter((piece) => piece.date >= from) };
		taskIds = piecesToTasks(kept).map(
			(task) =>
				tx
					.insert(tasks)
					.values({ ...task, email })
					.returning({ id: tasks.id })
					.get().id
		);
	}
	tx.insert(calendarEvents)
		.values({
			email,
			calendarId,
			eventId: event.id,
			etag: event.etag ?? '',
			kind: mapped.kind === 'allDay' ? 'allDay' : 'timed',
			title: mapped.kind === 'skip' ? '' : mapped.title,
			dates: datesOf(mapped),
			taskIds
		})
		.onConflictDoNothing()
		.run();
	return taskIds.length;
}

/**
 * The first import, after the user saw the preview. `all` keeps events that overlap the plan (Plan marks them),
 * `noClash` leaves those out and remembers them, so a later sync does not bring them in either. Everything is one
 * transaction, a failure writes nothing.
 */
export async function importCalendars(
	email: string,
	mode: ImportMode,
	now: number
): Promise<CalendarImport | null> {
	const state = calendarState(email);
	if (state.status !== 'preview') return null;
	return guarded(email, async () => {
		const { fetched, window } = await fetchAll(email, now, state.calendars);
		return db.transaction((tx) => {
			const plan = planFrom(email, window.from, tx);
			const result: CalendarImport = { tasks: 0, left: 0, allDay: 0 };
			for (const item of fetched) {
				if (item.mapped.kind === 'skip') continue;
				const clash = clashesWith(item.mapped, plan);
				const make = !(mode === 'noClash' && clash);
				result.tasks += insertEvent(tx, email, window.from, item, make);
				if (item.mapped.kind === 'allDay') result.allDay++;
				else if (!make) result.left++;
			}
			tx.update(calendarSync)
				.set({ status: 'active', syncedAt: now })
				.where(eq(calendarSync.email, email))
				.run();
			return result;
		});
	});
}

const asKnown = (row: typeof calendarEvents.$inferSelect): KnownEvent => ({
	calendarId: row.calendarId,
	eventId: row.eventId,
	etag: row.etag,
	kind: row.kind,
	taskIds: row.taskIds,
	dates: row.dates
});

function changeEvent(tx: Tx, email: string, from: string, known: KnownEvent, item: Fetched) {
	const { mapped, event } = item;
	const where = and(
		eq(calendarEvents.email, email),
		eq(calendarEvents.calendarId, known.calendarId),
		eq(calendarEvents.eventId, known.eventId)
	);
	const record = {
		etag: event.etag ?? '',
		title: mapped.kind === 'skip' ? '' : mapped.title,
		dates: datesOf(mapped)
	};
	let taskIds = known.taskIds;

	if (mapped.kind === 'timed' && known.taskIds.length > 0) {
		const existing = tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.email, email), inArray(tasks.id, known.taskIds)))
			.all();
		const pieces = mapped.pieces.filter((piece) => piece.date >= from);
		// Tasks the user deleted stay deleted, an event they removed from their plan is not forced back
		if (existing.length > 0) {
			if (existing.length === 1 && pieces.length === 1) {
				const [task] = piecesToTasks({ ...mapped, pieces });
				tx.update(tasks)
					.set({
						title: task.title,
						date: task.date,
						startTime: task.startTime,
						duration: task.duration
					})
					.where(eq(tasks.id, existing[0].id))
					.run();
			} else {
				tx.delete(tasks)
					.where(
						and(
							eq(tasks.email, email),
							inArray(
								tasks.id,
								existing.map((task) => task.id)
							)
						)
					)
					.run();
				taskIds = piecesToTasks({ ...mapped, pieces }).map(
					(task) =>
						tx
							.insert(tasks)
							.values({ ...task, email })
							.returning({ id: tasks.id })
							.get().id
				);
			}
		}
	}
	tx.update(calendarEvents)
		.set({ ...record, taskIds })
		.where(where)
		.run();
}

/** Brings the plan in line with Google. Quiet: nothing to do answers `changed: false`. */
async function runSync(email: string, now: number): Promise<{ changed: boolean }> {
	const state = calendarState(email);
	if (state.status !== 'active') return { changed: false };
	return guarded(email, async () => {
		const { fetched, window } = await fetchAll(email, now, state.calendars);
		return db.transaction((tx) => {
			const known = tx
				.select()
				.from(calendarEvents)
				.where(eq(calendarEvents.email, email))
				.all()
				.map(asKnown);
			const plan = planSync(fetched, known, window);
			for (const item of plan.add) insertEvent(tx, email, window.from, item, true);
			for (const { known: before, fetched: item } of plan.change)
				changeEvent(tx, email, window.from, before, item);
			for (const gone of plan.remove) {
				if (gone.taskIds.length > 0)
					tx.delete(tasks)
						.where(and(eq(tasks.email, email), inArray(tasks.id, gone.taskIds)))
						.run();
				tx.delete(calendarEvents)
					.where(
						and(
							eq(calendarEvents.email, email),
							eq(calendarEvents.calendarId, gone.calendarId),
							eq(calendarEvents.eventId, gone.eventId)
						)
					)
					.run();
			}
			tx.update(calendarSync).set({ syncedAt: now }).where(eq(calendarSync.email, email)).run();
			return { changed: plan.add.length + plan.change.length + plan.remove.length > 0 };
		});
	});
}

const running = new Map<string, Promise<{ changed: boolean }>>();

/** One sync per user at a time: the tick and a screen that just opened share the same one. */
export function syncCalendars(email: string, now: number) {
	const already = running.get(email);
	if (already) return already;
	const started = runSync(email, now).finally(() => running.delete(email));
	running.set(email, started);
	return started;
}

/** Everyone whose calendars are followed, for the scheduler. */
export const syncedUsers = () =>
	db
		.select({ email: calendarSync.email })
		.from(calendarSync)
		.where(eq(calendarSync.status, 'active'))
		.all()
		.map((row) => row.email);

/** Stops following the calendars. Tasks already imported stay in the plan, they are the user's now. */
export function stopSync(email: string) {
	db.delete(calendarSync).where(eq(calendarSync.email, email)).run();
	db.delete(calendarEvents).where(eq(calendarEvents.email, email)).run();
}

/** The all-day events of the days from `from` to `to` inclusive, for the line on Plan. */
export function allDayLines(email: string, from: string, to: string): AllDayLine[] {
	const lines: AllDayLine[] = [];
	for (const row of db
		.select()
		.from(calendarEvents)
		.where(and(eq(calendarEvents.email, email), eq(calendarEvents.kind, 'allDay')))
		.all())
		for (const date of row.dates)
			if (date >= from && date <= to) lines.push({ date, title: row.title });
	return lines.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Calendar was linked and its token is stored. */
export function calendarLinked(email: string): boolean {
	const user = db.select().from(users).where(eq(users.email, email)).get();
	return parseServices(user?.googleServices).includes('calendar') && hasRefreshToken(email);
}

/**
 * Runs a calendar request for a signed in user whose calendar is linked. A dropped grant answers 409 (the link was
 * ended, ask the user to link again), any other failure of Google 502, so a screen can say why.
 */
export async function withCalendar<T>(
	user: { email: string } | undefined,
	work: (email: string) => Promise<T>
) {
	if (!user) error(401, 'Login required');
	if (!calendarLinked(user.email)) error(409, 'Link Google Calendar first');
	try {
		return await work(user.email);
	} catch (failure) {
		if (failure instanceof GoogleAuthError)
			error(409, 'Google no longer accepts the link, link Calendar again');
		console.error('[calendar] Google failed', failure);
		error(502, 'Google Calendar did not answer, try again in a minute');
	}
}
