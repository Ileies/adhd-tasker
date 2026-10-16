/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { AssistantError } from '#lib/core/context.js';
import { CLOCK_SKEW_MS, loadFlow, recordFlow } from '#lib/core/flow.js';
import { createTodo, updateTodo } from '#lib/core/todos.js';
import { NOW, testCtx } from '#test/ctx.js';

const failure = async (work: Promise<unknown>) => {
	try {
		await work;
	} catch (thrown) {
		return thrown as AssistantError;
	}
	throw new Error('expected a failure');
};

describe('recordFlow', () => {
	test('stores the answer with the server clock and today as the date', async () => {
		const { ctx } = await testCtx();
		const row = await recordFlow(ctx, { type: 'start', todoId: 3, data: { note: 'go' } });
		expect(row).toMatchObject({
			at: NOW,
			date: '2026-10-14',
			type: 'start',
			todoId: 3,
			taskId: null,
			data: { note: 'go' },
			key: null
		});
		expect(await loadFlow(ctx, '2026-10-14')).toHaveLength(1);
	});

	test('a client time within the skew is kept, a farther one is replaced by the server time', async () => {
		const { ctx } = await testCtx();
		expect((await recordFlow(ctx, { type: 'rest', at: NOW - 30_000 }))?.at).toBe(NOW - 30_000);
		expect((await recordFlow(ctx, { type: 'rest', at: NOW - CLOCK_SKEW_MS - 1 }))?.at).toBe(NOW);
		expect((await recordFlow(ctx, { type: 'rest', at: 'now' }))?.at).toBe(NOW);
	});

	test('the date follows the timezone of the user', async () => {
		const { ctx, repo } = await testCtx({ now: Date.parse('2026-10-14T23:30:00Z') });
		await repo.settings.update({ timezone: 'Europe/Berlin' });
		expect((await recordFlow(ctx, { type: 'rest' }))?.date).toBe('2026-10-15');
	});

	test('a pin needs its key and the same key is written once', async () => {
		const { ctx, hints } = await testCtx();
		expect((await failure(recordFlow(ctx, { type: 'pin', todoId: 1 }))).status).toBe(400);
		expect((await failure(recordFlow(ctx, { type: 'pin', key: 'x' }))).status).toBe(400);
		const pin = { type: 'pin', todoId: 1, key: 'pin:1000' };
		expect(await recordFlow(ctx, pin)).not.toBeNull();
		expect(await recordFlow(ctx, pin)).toBeNull();
		expect(await loadFlow(ctx, '2026-10-14')).toHaveLength(1);
		expect(hints.filter((hint) => hint.type === 'flow')).toHaveLength(1);
	});

	test('a pin key may carry an attempt for a session whose first pick is gone', async () => {
		const { ctx } = await testCtx();
		expect(await recordFlow(ctx, { type: 'pin', todoId: 1, key: 'pin:999:2' })).not.toBeNull();
	});

	test('a key on any other type is ignored', async () => {
		const { ctx } = await testCtx();
		await recordFlow(ctx, { type: 'rest', key: 'pin:5' });
		expect((await recordFlow(ctx, { type: 'rest', key: 'pin:5' }))?.key).toBeNull();
	});

	test.each([
		['no type', {}],
		['an unknown type', { type: 'dance' }],
		['data that is a list', { type: 'check', data: [] }],
		['data that is text', { type: 'check', data: 'done' }],
		['data that is too long', { type: 'check', data: { text: 'x'.repeat(600) } }],
		['a todoId that is not an id', { type: 'start', todoId: 'a' }],
		['a taskId of zero', { type: 'start', taskId: 0 }]
	])('%s answers 400 and stores nothing', async (_name, body) => {
		const { ctx } = await testCtx();
		expect((await failure(recordFlow(ctx, body))).status).toBe(400);
		expect(await loadFlow(ctx, '2026-10-14')).toEqual([]);
	});

	test('anything that is not an object answers 400', async () => {
		const { ctx } = await testCtx();
		expect((await failure(recordFlow(ctx, null))).status).toBe(400);
	});
});

describe('recordFlow, rotations, breaks and Face it', () => {
	const made = async () => {
		const set = await testCtx();
		const todo = await createTodo(set.ctx, { title: 'Study B' });
		return { ...set, todo };
	};

	test('a rotation counts a skip on the to-do and the day of the first one', async () => {
		const { ctx, repo, todo } = await made();
		await recordFlow(ctx, { type: 'rotate', todoId: todo.id, data: { why: 'unfocused' } });
		expect(await repo.todos.get(todo.id)).toMatchObject({ skips: 1, skipSince: '2026-10-14' });
		await recordFlow(ctx, { type: 'rotate', todoId: todo.id, data: { why: 'else' } });
		expect(await repo.todos.get(todo.id)).toMatchObject({ skips: 2, skipSince: '2026-10-14' });
	});

	test('moving forward ends the count', async () => {
		const { ctx, repo, todo } = await made();
		await recordFlow(ctx, { type: 'rotate', todoId: todo.id, data: { why: 'else' } });
		await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { before: 0, after: 20, minutes: 30 }
		});
		expect(await repo.todos.get(todo.id)).toMatchObject({ skips: 0, skipSince: null });
	});

	test('a Face it answer ends the count too', async () => {
		const { ctx, repo, todo } = await made();
		await recordFlow(ctx, { type: 'rotate', todoId: todo.id, data: { why: 'else' } });
		await recordFlow(ctx, { type: 'face', todoId: todo.id, data: { answer: 'fine' } });
		expect(await repo.todos.get(todo.id)).toMatchObject({ skips: 0, skipSince: null });
	});

	test('a break is stored with its minutes and activity, unknown keys are dropped', async () => {
		const { ctx } = await made();
		const row = await recordFlow(ctx, {
			type: 'break',
			data: { minutes: 10, activity: 'water', why: 'asked', secret: 'x' }
		});
		expect(row?.data).toEqual({ minutes: 10, activity: 'water', why: 'asked' });
	});

	test('"I\'m back" and a stuck tap are stored', async () => {
		const { ctx, todo } = await made();
		expect(await recordFlow(ctx, { type: 'back' })).toMatchObject({ type: 'back', data: {} });
		const stuck = await recordFlow(ctx, {
			type: 'stuck',
			todoId: todo.id,
			data: { reason: 'cant-start' }
		});
		expect(stuck?.data).toEqual({ reason: 'cant-start' });
	});

	test('a pin keeps only whether its session is Face it', async () => {
		const { ctx } = await made();
		const row = await recordFlow(ctx, {
			type: 'pin',
			todoId: 1,
			key: 'pin:5',
			data: { face: true, extra: 1 }
		});
		expect(row?.data).toEqual({ face: true });
	});

	test.each([
		[
			'a rotation of a to-do that does not exist',
			{ type: 'rotate', todoId: 99, data: { why: 'else' } },
			404
		],
		['a rotation without a to-do', { type: 'rotate', data: { why: 'else' } }, 400],
		['a rotation for a made up reason', { type: 'rotate', todoId: 1, data: { why: 'bored' } }, 400],
		['a break of no minutes', { type: 'break', data: { minutes: 0 } }, 400],
		['a stuck tap with no reason', { type: 'stuck', todoId: 1, data: {} }, 400],
		[
			'a stuck tap about a to-do that does not exist',
			{ type: 'stuck', todoId: 99, data: { reason: 'break' } },
			404
		],
		[
			'a face it answer that is not offered',
			{ type: 'face', todoId: 1, data: { answer: 'later' } },
			400
		],
		['a face it answer without a to-do', { type: 'face', data: { answer: 'fine' } }, 400]
	])('%s is refused', async (_name, body, status) => {
		const { ctx } = await made();
		expect((await failure(recordFlow(ctx, body))).status).toBe(status);
		expect(await loadFlow(ctx, '2026-10-14')).toEqual([]);
	});
});

describe('recordFlow, an answered check', () => {
	const asked = async (estimate: number | null = 300) => {
		const made = await testCtx();
		const todo = await createTodo(made.ctx, { title: 'Study B', estimate });
		return { ...made, todo };
	};
	const answer = { before: 0, after: 20, minutes: 30 };

	test('writes the progress and the time spent on the to-do, and keeps the answer in the row', async () => {
		const { ctx, repo, todo, hints } = await asked();
		const row = await recordFlow(ctx, { type: 'check', todoId: todo.id, data: answer });
		expect(row?.data).toEqual({ ...answer, slow: false });
		expect(await repo.todos.get(todo.id)).toMatchObject({ progress: 20, spentMinutes: 30 });
		expect(hints.map((hint) => hint.type)).toContain('todos');
	});

	test('Keep going adds the time and leaves the progress alone', async () => {
		const { ctx, repo, todo } = await asked();
		await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { before: 0, after: 0, minutes: 30, keep: true }
		});
		expect(await repo.todos.get(todo.id)).toMatchObject({ progress: 0, spentMinutes: 30 });
	});

	test('the server decides what is slow, from the size of the to-do', async () => {
		const { ctx, todo } = await asked();
		const row = await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { before: 20, after: 20, minutes: 30, slow: false }
		});
		expect(row?.data.slow).toBe(true);
	});

	test('a to-do without a size is never slow', async () => {
		const { ctx, todo } = await asked(null);
		const row = await recordFlow(ctx, { type: 'check', todoId: todo.id, data: answer });
		expect(row?.data.slow).toBe(false);
	});

	test('"bigger than I thought" makes the size what the pace says', async () => {
		const { ctx, repo, todo } = await asked();
		await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { before: 0, after: 10, minutes: 60, pace: 'bigger' }
		});
		expect(await repo.todos.get(todo.id)).toMatchObject({ estimate: 600, learned: true });
	});

	test('a size the user gives is theirs', async () => {
		const { ctx, repo, todo } = await asked(null);
		await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { ...answer, size: 120 }
		});
		expect(await repo.todos.get(todo.id)).toMatchObject({ estimate: 120, learned: false });
	});

	test('"Not sure" is kept in the row so the size is not asked again', async () => {
		const { ctx, repo, todo } = await asked(null);
		const row = await recordFlow(ctx, {
			type: 'check',
			todoId: todo.id,
			data: { ...answer, size: null }
		});
		expect(row?.data.size).toBeNull();
		expect((await repo.todos.get(todo.id))?.estimate).toBeNull();
	});

	test('a check is about a to-do that is open', async () => {
		const { ctx, todo } = await asked();
		expect((await failure(recordFlow(ctx, { type: 'check', data: answer }))).status).toBe(400);
		expect(
			(await failure(recordFlow(ctx, { type: 'check', todoId: 99, data: answer }))).status
		).toBe(404);
		await updateTodo(ctx, { id: todo.id, status: 'done' });
		expect(
			(await failure(recordFlow(ctx, { type: 'check', todoId: todo.id, data: answer }))).status
		).toBe(404);
	});

	test.each([
		['no progress before', { after: 10, minutes: 30 }],
		['a progress over 100', { before: 0, after: 101, minutes: 30 }],
		['negative minutes', { before: 0, after: 10, minutes: -1 }],
		['more than two hours', { before: 0, after: 10, minutes: 121 }],
		['Keep going with a new progress', { before: 0, after: 10, minutes: 30, keep: true }],
		['a keep that is not true', { before: 0, after: 0, minutes: 30, keep: false }],
		['a reason that is not offered', { before: 0, after: 10, minutes: 30, pace: 'dance' }],
		['a size of zero', { before: 0, after: 10, minutes: 30, size: 0 }],
		['a worked that is not true', { before: 0, after: 10, minutes: 30, worked: false }]
	])('%s answers 400 and changes nothing', async (_name, data) => {
		const { ctx, repo, todo } = await asked();
		expect((await failure(recordFlow(ctx, { type: 'check', todoId: todo.id, data }))).status).toBe(
			400
		);
		expect(await loadFlow(ctx, '2026-10-14')).toEqual([]);
		expect(await repo.todos.get(todo.id)).toMatchObject({ progress: 0, spentMinutes: 0 });
	});
});
