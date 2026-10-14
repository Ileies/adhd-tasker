import type { Ctx } from '#lib/core/context.js';
import { describeChange, type EventOrigin, type EventType } from '#lib/events.js';
import type { Task } from '#lib/types.js';

/**
 * Logs one event and, unless the agent caused it, lets the agent look at it shortly after.
 * Never throws: the plan edit that raised the event must succeed even when logging fails.
 * `key` makes detected events idempotent, returns null when that fact is already logged.
 */
export async function emit(
	ctx: Ctx,
	type: EventType,
	payload: Record<string, unknown>,
	origin: EventOrigin,
	key?: string
): Promise<number | null> {
	try {
		const now = ctx.now();
		// The agent's own doing and the chat itself need no reaction, they are only logged
		const outcome =
			origin === 'agent'
				? 'caused by the agent'
				: type === 'user.message'
					? 'answered in the chat'
					: type === 'alarm.fired'
						? 'rang on the open screens'
						: null;
		const id = await ctx.repo.events.insert({
			type,
			payload,
			origin,
			key: key ?? null,
			createdAt: now,
			handledAt: outcome ? now : null,
			outcome
		});
		if (id === null) return null;
		if (!outcome) ctx.react();
		return id;
	} catch (error) {
		console.error('[events] could not log', type, error);
		return null;
	}
}

/** Emits the event a task edit amounts to, nothing when the edit changed nothing visible. */
export async function emitChange(
	ctx: Ctx,
	before: Task | null,
	after: Task | null,
	origin: EventOrigin,
	extra: Record<string, unknown> = {}
) {
	const change = describeChange(before, after);
	if (change) await emit(ctx, change.type, { ...change.payload, ...extra }, origin);
}

/** Start of the user's current day in ms, good enough for a daily meter (whole-minute offsets). */
export function startOfDayMs(minutesIntoDay: number, nowMs: number) {
	return nowMs - minutesIntoDay * 60_000 - (nowMs % 60_000);
}
