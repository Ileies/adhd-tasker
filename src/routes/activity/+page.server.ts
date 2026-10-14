import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { tokensToday } from '#lib/core/usage.js';
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import { describeEvent } from '#lib/events.js';
import { serverCtx } from '#lib/server/ctx.js';

const LIMIT = 40;

/** What the agent changed (with Undo), what it saw and what it did about it, and today's token use. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const { email, timezone, dailyTokenBudget } = locals.user;
	const ctx = serverCtx(email);

	const [actions, seen, tokens] = await Promise.all([
		ctx.repo.actions.recent(LIMIT),
		ctx.repo.events.recent(LIMIT),
		tokensToday(ctx, timezone ?? 'UTC')
	]);

	return {
		tokensToday: tokens,
		dailyTokenBudget,
		actions: actions.map((row) => ({
			id: row.id,
			summary: summarizeAction(row.tool, row.before, row.after),
			dates: datesOfAction(row.before, row.after),
			reason: row.reason,
			onItsOwn: row.eventId !== null,
			at: row.createdAt,
			undone: row.undoneAt !== null
		})),
		events: seen.map((row) => ({
			id: row.id,
			line: describeEvent(row.type, row.payload),
			origin: row.origin,
			outcome: row.outcome,
			at: row.createdAt
		}))
	};
};
