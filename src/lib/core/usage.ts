import type { Ctx } from '#lib/core/context.js';
import { startOfDayMs } from '#lib/core/events.js';
import { minutesNow } from '#lib/time.js';

/** Tokens of one model call, for the daily meter and the budget. Tone rows count with 0 tokens. */
export function recordUsage(ctx: Ctx, use: string, tokens: number) {
	return ctx.repo.usage.record(use, tokens, ctx.now());
}

/** Start of the user's current day in ms. */
export const dayStart = (ctx: Ctx, timezone: string) =>
	startOfDayMs(minutesNow(timezone, new Date(ctx.now())), ctx.now());

/** How often something was used since the user's day began, for the daily caps on custom tones. */
export const countUsesToday = (ctx: Ctx, timezone: string, use: string) =>
	ctx.repo.usage.countSince(use, dayStart(ctx, timezone));

/** Tokens used since the user's day began. */
export const tokensToday = (ctx: Ctx, timezone: string) =>
	ctx.repo.usage.tokensSince(dayStart(ctx, timezone));
