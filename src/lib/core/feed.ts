/**
 * What the agent did on its own, for the Now screen, and the two things a user tells it back:
 * a card was answered, "I'm stuck". The `/agent` routes call these for an account, the local
 * backend for a guest.
 */
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import { findStuckReason } from '#lib/anchoring.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit } from '#lib/core/events.js';

interface FeedCard {
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

/**
 * "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this.
 * `body` is `{ taskId | todoId, reason }`: the item the user is stuck on is a task at a time or a to-do.
 */
export async function reportStuck(ctx: Ctx, body: unknown): Promise<void> {
	const {
		taskId,
		todoId,
		reason: raw
	} = (body ?? {}) as { taskId?: unknown; todoId?: unknown; reason?: unknown };
	const reason = findStuckReason(raw);
	if (!reason || (typeof taskId !== 'number') === (typeof todoId !== 'number'))
		throw new AssistantError('a taskId or a todoId and a known reason are needed', 400);

	if (typeof todoId === 'number') {
		const todo = await ctx.repo.todos.get(todoId);
		if (!todo) throw new AssistantError('No such to-do', 404);
		await emit(
			ctx,
			'stuck.pressed',
			{ todoId: todo.id, title: todo.title, reason: reason.label, reasonId: reason.id },
			'user'
		);
		return;
	}
	const task = await ctx.repo.tasks.get(taskId as number);
	if (!task) throw new AssistantError('No such task', 404);
	await emit(
		ctx,
		'stuck.pressed',
		{ taskId: task.id, title: task.title, reason: reason.label, reasonId: reason.id },
		'user'
	);
}
