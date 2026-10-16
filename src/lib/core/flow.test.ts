/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { AssistantError } from '#lib/core/context.js';
import { CLOCK_SKEW_MS, loadFlow, recordFlow } from '#lib/core/flow.js';
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
