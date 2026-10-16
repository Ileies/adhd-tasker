/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { AssistantError } from '#lib/core/context.js';
import { testCtx } from '#test/ctx.js';

const valid = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: 3
};

const failure = async (work: Promise<unknown>) => {
	try {
		await work;
	} catch (thrown) {
		return thrown as AssistantError;
	}
	throw new Error('expected a failure');
};

describe('createPlanTask', () => {
	test('stores the task and logs one task.created event by the user', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		expect(await repo.tasks.get(created.id)).toEqual(created);
		expect(await repo.events.recent(5)).toMatchObject([{ type: 'task.created', origin: 'user' }]);
	});

	test('a task stays unless it says how far it may move', async () => {
		const { ctx } = await testCtx();
		expect((await createPlanTask(ctx, valid)).shift).toBe(0);
		expect((await createPlanTask(ctx, { ...valid, shift: 60 })).shift).toBe(60);
	});

	test('how far a task may move can be changed later', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		await updatePlanTask(ctx, { id: created.id, shift: 30 });
		expect((await repo.tasks.get(created.id))?.shift).toBe(30);
	});

	test('asks the agent to look at the new event', async () => {
		const { ctx, state } = await testCtx();
		await createPlanTask(ctx, valid);
		expect(state.reacts).toBe(1);
	});

	test('an invalid task answers 400 with the reason and stores nothing', async () => {
		const { ctx, repo } = await testCtx();
		const error = await failure(createPlanTask(ctx, { ...valid, duration: 0 }));
		expect(error).toBeInstanceOf(AssistantError);
		expect(error.status).toBe(400);
		expect(error.message).not.toBe('');
		expect(await repo.tasks.between('2000-01-01')).toEqual([]);
	});
});

describe('updatePlanTask', () => {
	test('changes the given fields and logs the change', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		await updatePlanTask(ctx, { id: created.id, title: 'New title' });
		expect((await repo.tasks.get(created.id))?.title).toBe('New title');
		expect((await repo.events.recent(1))[0].type).toBe('task.updated');
	});

	test.each([
		['no id', { title: 'x' }, 400],
		['an unknown id', { id: 999, title: 'x' }, 404],
		['an invalid field', { id: 1, duration: -5 }, 400]
	])('%s answers %d', async (_name, body, status) => {
		const { ctx } = await testCtx();
		await createPlanTask(ctx, valid);
		expect((await failure(updatePlanTask(ctx, body))).status).toBe(status);
	});

	test('a start that pushes the saved duration over midnight is refused', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		const error = await failure(updatePlanTask(ctx, { id: created.id, startTime: 1430 }));
		expect(error.status).toBe(400);
		expect((await repo.tasks.get(created.id))?.startTime).toBe(540);
	});
});

describe('deletePlanTask', () => {
	test('removes the task and logs task.deleted', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		await deletePlanTask(ctx, { id: created.id });
		expect(await repo.tasks.get(created.id)).toBeNull();
		expect((await repo.events.recent(1))[0].type).toBe('task.deleted');
	});

	test.each([
		['no id', {}, 400],
		['an unknown id', { id: 999 }, 404]
	])('%s answers %d', async (_name, body, status) => {
		const { ctx } = await testCtx();
		expect((await failure(deletePlanTask(ctx, body))).status).toBe(status);
	});
});

describe('completion stamp', () => {
	test('done stamps the time and reopening clears it', async () => {
		const { ctx, repo } = await testCtx();
		const created = await createPlanTask(ctx, valid);
		await updatePlanTask(ctx, { id: created.id, status: 'completed' });
		expect((await repo.tasks.get(created.id))?.completedAt).toBe(ctx.now());
		await updatePlanTask(ctx, { id: created.id, status: 'pending' });
		expect((await repo.tasks.get(created.id))?.completedAt).toBeNull();
	});

	test('a task created done is stamped', async () => {
		const { ctx } = await testCtx();
		expect((await createPlanTask(ctx, { ...valid, status: 'completed' })).completedAt).toBe(
			ctx.now()
		);
	});
});
