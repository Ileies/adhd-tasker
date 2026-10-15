/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { countUsesToday, dayStart, recordUsage, tokensToday } from '#lib/core/usage.js';
import { NOW, testCtx } from '#test/ctx.js';

const HOUR = 3_600_000;

describe('dayStart', () => {
	test("is midnight of the user's day", async () => {
		const { ctx } = await testCtx();
		expect(dayStart(ctx, 'UTC')).toBe(Date.parse('2026-10-14T00:00:00Z'));
	});

	test("follows the user's timezone, not the clock of the machine", async () => {
		const { ctx } = await testCtx();
		// 09:00 UTC is 11:00 in Berlin (summer time), so the day began 22:00 UTC the evening before
		expect(dayStart(ctx, 'Europe/Berlin')).toBe(Date.parse('2026-10-13T22:00:00Z'));
	});
});

describe('recordUsage', () => {
	test('stores the tokens at the time of the context clock', async () => {
		const { ctx, repo } = await testCtx();
		await recordUsage(ctx, 'chat', 120);
		expect(await repo.usage.tokensSince(NOW - 1)).toBe(120);
		expect(await repo.usage.tokensSince(NOW + 1)).toBe(0);
	});
});

describe('tokensToday', () => {
	test('counts only what was used since the day began', async () => {
		const { ctx, repo } = await testCtx();
		await repo.usage.record('chat', 100, NOW - 2 * HOUR);
		await repo.usage.record('reaction', 40, NOW - 1000);
		await repo.usage.record('chat', 999, NOW - 10 * HOUR);
		expect(await tokensToday(ctx, 'UTC')).toBe(140);
	});

	test("a row just after midnight in the user's zone is today, before it is yesterday", async () => {
		const { ctx, repo } = await testCtx();
		await repo.usage.record('chat', 500, Date.parse('2026-10-13T22:30:00Z'));
		await repo.usage.record('chat', 70, Date.parse('2026-10-13T21:30:00Z'));
		expect(await tokensToday(ctx, 'Europe/Berlin')).toBe(500);
		expect(await tokensToday(ctx, 'UTC')).toBe(0);
	});
});

describe('countUsesToday', () => {
	test('counts rows of one use, tone rows carry no tokens', async () => {
		const { ctx } = await testCtx();
		await recordUsage(ctx, 'tone', 0);
		await recordUsage(ctx, 'tone', 0);
		await recordUsage(ctx, 'chat', 30);
		expect(await countUsesToday(ctx, 'UTC', 'tone')).toBe(2);
		expect(await tokensToday(ctx, 'UTC')).toBe(30);
	});

	test('is available again the next day', async () => {
		const { ctx, state } = await testCtx();
		await recordUsage(ctx, 'tone', 0);
		state.now = NOW + 24 * HOUR;
		expect(await countUsesToday(ctx, 'UTC', 'tone')).toBe(0);
	});
});
