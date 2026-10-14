/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { activityView } from '#lib/core/activity.js';
import { createPlanTask } from '#lib/core/plan.js';
import { NOW, testCtx } from '#test/ctx.js';

describe('activityView', () => {
	test('is empty for a new user', async () => {
		const { ctx } = await testCtx();
		expect(await activityView(ctx)).toEqual({
			tokensToday: 0,
			dailyTokenBudget: null,
			actions: [],
			events: []
		});
	});

	test('lists the assistant changes newest first with their reason and whether they were undone', async () => {
		const { ctx, repo } = await testCtx();
		const task = await createPlanTask(ctx, {
			title: 'Write intro',
			description: '',
			date: '2026-10-14',
			startTime: 540,
			duration: 60,
			priority: 3
		});
		const first = await repo.actions.record({
			tool: 'add_task',
			before: null,
			after: task,
			eventId: null,
			reason: 'You asked',
			createdAt: NOW
		});
		const second = await repo.actions.record({
			tool: 'delete_task',
			before: task,
			after: null,
			eventId: 4,
			reason: null,
			createdAt: NOW + 1
		});
		await repo.actions.markUndone(first, NOW + 2);
		const { actions } = await activityView(ctx);
		expect(actions.map((a) => a.id)).toEqual([second, first]);
		expect(actions[0]).toMatchObject({ onItsOwn: true, undone: false, dates: ['2026-10-14'] });
		expect(actions[1]).toMatchObject({ onItsOwn: false, undone: true, reason: 'You asked' });
	});

	test('lists the events with a line and what became of them', async () => {
		const { ctx } = await testCtx();
		await createPlanTask(ctx, {
			title: 'Write intro',
			description: '',
			date: '2026-10-14',
			startTime: 540,
			duration: 60,
			priority: 3
		});
		const { events } = await activityView(ctx);
		expect(events).toMatchObject([{ origin: 'user', outcome: null, line: expect.any(String) }]);
	});

	test('counts only the tokens of today and shows the budget', async () => {
		const { ctx, repo } = await testCtx();
		await repo.settings.update({ dailyTokenBudget: 5000 });
		await repo.usage.record('chat', 100, NOW - 2 * 86_400_000);
		await repo.usage.record('chat', 40, NOW - 1000);
		expect(await activityView(ctx)).toMatchObject({ tokensToday: 40, dailyTokenBudget: 5000 });
	});
});
