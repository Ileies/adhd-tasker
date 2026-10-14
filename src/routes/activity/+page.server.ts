import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index.js';
import { agentActions, events } from '#lib/server/db/schema.js';
import { tokensSince, startOfDayMs } from '#lib/server/events.js';
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import { describeEvent } from '#lib/events.js';
import { minutesNow } from '#lib/time.js';
import type { Task } from '#lib/types.js';

const LIMIT = 40;

/** What the agent changed (with Undo), what it saw and what it did about it, and today's token use. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const { email, timezone, dailyTokenBudget } = locals.user;

	const [actions, seen, tokensToday] = await Promise.all([
		db
			.select()
			.from(agentActions)
			.where(eq(agentActions.email, email))
			.orderBy(desc(agentActions.id))
			.limit(LIMIT),
		db.select().from(events).where(eq(events.email, email)).orderBy(desc(events.id)).limit(LIMIT),
		tokensSince(email, startOfDayMs(minutesNow(timezone ?? 'UTC')))
	]);

	return {
		tokensToday,
		dailyTokenBudget,
		actions: actions.map((row) => {
			const before = row.before as Task | null;
			const after = row.after as Task | null;
			return {
				id: row.id,
				summary: summarizeAction(row.tool, before, after),
				dates: datesOfAction(before, after),
				reason: row.reason,
				onItsOwn: row.eventId !== null,
				at: row.createdAt,
				undone: row.undoneAt !== null
			};
		}),
		events: seen.map((row) => ({
			id: row.id,
			line: describeEvent(row.type, row.payload),
			origin: row.origin,
			outcome: row.outcome,
			at: row.createdAt
		}))
	};
};
