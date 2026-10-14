/**
 * What the Activity screen shows: what the assistant changed (with Undo), the events it saw and
 * what became of them, and today's token use. One shape for an account and for a guest.
 */
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import type { Ctx } from '#lib/core/context.js';
import { tokensToday } from '#lib/core/usage.js';
import { describeEvent } from '#lib/events.js';

const LIMIT = 40;

export interface ActivityView {
	tokensToday: number;
	dailyTokenBudget: number | null;
	actions: {
		id: number;
		summary: string;
		dates: string[];
		reason: string | null;
		onItsOwn: boolean;
		at: number;
		undone: boolean;
	}[];
	events: { id: number; line: string; origin: string; outcome: string | null; at: number }[];
}

export async function activityView(ctx: Ctx): Promise<ActivityView> {
	const { timezone, dailyTokenBudget } = await ctx.repo.settings.get();
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
}
