/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { agentFeed, dismissCard, reportStuck } from '#lib/core/feed.js';
import { createPlanTask } from '#lib/core/plan.js';
import { STUCK_REASONS } from '#lib/anchoring.js';
import { testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';

const valid = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: 3
};

describe('agentFeed', () => {
	test('is empty before the agent did anything', async () => {
		const { ctx } = await testCtx();
		expect(await agentFeed(ctx, null)).toEqual({ cursor: 0, cards: [], changes: [] });
	});

	test('shows the open card with its options', async () => {
		const { ctx, repo } = await testCtx();
		const card = await repo.cards.show({
			kind: 'ask',
			text: 'Move it?',
			options: ['yes', 'no'],
			createdAt: 1
		});
		expect((await agentFeed(ctx, null)).cards).toEqual([
			{ id: card.id, kind: 'ask', text: 'Move it?', options: ['yes', 'no'] }
		]);
	});

	test('lists the agent own edits after the cursor, but not on the first look', async () => {
		const { ctx, repo } = await testCtx();
		const task = await createPlanTask(ctx, valid);
		const id = await repo.actions.record({
			tool: 'delete_task',
			before: task,
			after: null,
			eventId: 7,
			reason: null
		});
		expect((await agentFeed(ctx, null)).changes).toEqual([]);
		const feed = await agentFeed(ctx, 0);
		expect(feed.cursor).toBe(id);
		expect(feed.changes).toMatchObject([{ id, dates: ['2026-10-14'] }]);
		expect((await agentFeed(ctx, id)).changes).toEqual([]);
	});

	test('chat edits (no event) are left to the chat', async () => {
		const { ctx, repo } = await testCtx();
		await repo.actions.record({
			tool: 'add_task',
			before: null,
			after: null,
			eventId: null,
			reason: null
		});
		expect((await agentFeed(ctx, 0)).changes).toEqual([]);
	});
});

describe('dismissCard', () => {
	test('resolves an open card once', async () => {
		const { ctx, repo } = await testCtx();
		const card = await repo.cards.show({ kind: 'say', text: 'x', createdAt: 1 });
		await dismissCard(ctx, card.id);
		expect(await repo.cards.open()).toBeNull();
		expect(await failureOf(dismissCard(ctx, card.id))).toMatchObject({ status: 404 });
	});

	test('a card id must be a whole number', async () => {
		const { ctx } = await testCtx();
		expect(await failureOf(dismissCard(ctx, 'x'))).toMatchObject({ status: 400 });
		expect(await failureOf(dismissCard(ctx, NaN))).toMatchObject({ status: 400 });
	});
});

describe('reportStuck', () => {
	const reason = STUCK_REASONS[0];

	test('logs stuck.pressed by the user with the task and the reason', async () => {
		const { ctx, repo } = await testCtx();
		const task = await createPlanTask(ctx, valid);
		await reportStuck(ctx, { taskId: task.id, reason: reason.id });
		expect((await repo.events.recent(1))[0]).toMatchObject({
			type: 'stuck.pressed',
			origin: 'user',
			payload: { taskId: task.id, title: 'Write intro', reason: reason.label }
		});
	});

	test.each([
		['no body', null, 400],
		['an unknown reason', { taskId: 1, reason: 'bored' }, 400],
		['a task id that is not a number', { taskId: '1', reason: STUCK_REASONS[0].id }, 400],
		['a task that does not exist', { taskId: 999, reason: STUCK_REASONS[0].id }, 404]
	])('%s answers %d', async (_name, body, status) => {
		const { ctx } = await testCtx();
		expect(await failureOf(reportStuck(ctx, body))).toMatchObject({ status });
	});
});
