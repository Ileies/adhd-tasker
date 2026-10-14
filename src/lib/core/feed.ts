/**
 * What the agent did on its own, for the Now screen, and the two things a user tells it back:
 * a card was answered, "I'm stuck". The `/agent` routes call these for an account, the local
 * backend for a guest.
 */
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import { findStuckReason } from '#lib/anchoring.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit } from '#lib/core/events.js';

export interface FeedCard {
	id: number;
	kind: 'say' | 'ask';
	text: string;
	options: string[];
}

/** The open card and the plan changes the agent made on its own since the cursor. */
export interface AgentFeed {
	cursor: number;
	cards: FeedCard[];
	changes: { id: number; summary: string; dates: string[] }[];
}

/**
 * `since` is the last action id the screen saw. Without it (`null`, the first look after a load)
 * only the cursor and the card are returned, so old edits are not announced again.
 */
export async function agentFeed(ctx: Ctx, since: number | null): Promise<AgentFeed> {
	const card = await ctx.repo.cards.open();
	const cursor = await ctx.repo.actions.latestId();
	const fresh =
		since !== null && Number.isInteger(since) ? await ctx.repo.actions.ownSince(since) : [];
	return {
		cursor,
		cards: card
			? [{ id: card.id, kind: card.kind, text: card.text, options: card.options ?? [] }]
			: [],
		changes: fresh.map((row) => ({
			id: row.id,
			summary: summarizeAction(row.tool, row.before, row.after),
			dates: datesOfAction(row.before, row.after)
		}))
	};
}

/** Dismisses or answers a card. The answer itself is sent to the chat by the client. */
export async function dismissCard(ctx: Ctx, id: unknown): Promise<void> {
	if (typeof id !== 'number' || !Number.isInteger(id))
		throw new AssistantError('id must be a card id', 400);
	if (!(await ctx.repo.cards.resolve(id, ctx.now())))
		throw new AssistantError('No such open card', 404);
}

/** "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this. */
export async function reportStuck(ctx: Ctx, body: unknown): Promise<void> {
	const { taskId, reason: raw } = (body ?? {}) as { taskId?: unknown; reason?: unknown };
	const reason = findStuckReason(raw);
	if (!reason || typeof taskId !== 'number')
		throw new AssistantError('taskId and a known reason are needed', 400);

	const task = await ctx.repo.tasks.get(taskId);
	if (!task) throw new AssistantError('No such task', 404);
	await emit(
		ctx,
		'stuck.pressed',
		{ taskId: task.id, title: task.title, reason: reason.label },
		'user'
	);
}
