import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { aiUsage, events } from '#lib/server/db/schema.js';
import { describeChange, type EventOrigin, type EventType } from '#lib/events.js';
import type { Task } from '#lib/types.js';

type Reactor = (email: string) => void;
let reactor: Reactor | null = null;

/** The agent registers itself here, so mutation paths only know `emit` and never the model code. */
export function setReactor(next: Reactor) {
	reactor = next;
}

/**
 * Logs one event and, unless the agent caused it, lets the agent look at it shortly after.
 * Never throws: the plan edit that raised the event must succeed even when logging fails.
 * `key` makes detected events idempotent, returns null when that fact is already logged.
 */
export async function emit(email: string, type: EventType, payload: Record<string, unknown>, origin: EventOrigin, key?: string): Promise<number | null> {
	try {
		const now = Date.now();
		// The agent's own doing and the chat itself need no reaction, they are only logged
		const outcome = origin === 'agent' ? 'caused by the agent' : type === 'user.message' ? 'answered in the chat' : type === 'alarm.fired' ? 'rang on the open screens' : null;
		const [row] = await db
			.insert(events)
			.values({ email, type, payload, origin, key: key ?? null, createdAt: now, handledAt: outcome ? now : null, outcome })
			.onConflictDoNothing()
			.returning({ id: events.id });
		if (!row) return null;
		if (!outcome) reactor?.(email);
		return row.id;
	} catch (error) {
		console.error('[events] could not log', type, error);
		return null;
	}
}

/** Emits the event a task edit amounts to, nothing when the edit changed nothing visible. */
export async function emitChange(email: string, before: Task | null, after: Task | null, origin: EventOrigin, extra: Record<string, unknown> = {}) {
	const change = describeChange(before, after);
	if (change) await emit(email, change.type, { ...change.payload, ...extra }, origin);
}

export async function recordUsage(email: string, use: string, tokens: number) {
	await db.insert(aiUsage).values({ email, use, tokens, createdAt: Date.now() });
}

export async function tokensSince(email: string, since: number) {
	const [row] = await db
		.select({ total: sql<number>`coalesce(sum(${aiUsage.tokens}), 0)` })
		.from(aiUsage)
		.where(and(eq(aiUsage.email, email), gte(aiUsage.createdAt, since)));
	return row?.total ?? 0;
}

/** How often something was used since a moment, for the daily caps on custom tones. */
export async function countUses(email: string, use: string, since: number) {
	const [row] = await db
		.select({ total: sql<number>`count(*)` })
		.from(aiUsage)
		.where(and(eq(aiUsage.email, email), eq(aiUsage.use, use), gte(aiUsage.createdAt, since)));
	return row?.total ?? 0;
}

export async function reactionTimes(email: string, since: number) {
	const rows = await db
		.select({ at: aiUsage.createdAt })
		.from(aiUsage)
		.where(and(eq(aiUsage.email, email), eq(aiUsage.use, 'reaction'), gte(aiUsage.createdAt, since)));
	return rows.map((row) => row.at);
}

/** Start of the user's current day in ms, good enough for a daily meter (whole-minute offsets). */
export function startOfDayMs(minutesIntoDay: number, nowMs = Date.now()) {
	return nowMs - minutesIntoDay * 60_000 - (nowMs % 60_000);
}
