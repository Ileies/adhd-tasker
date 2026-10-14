/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	addUserAlarm,
	alarmsOf,
	cancelEntry,
	fireDue,
	runScheduleTool,
	scheduleOverview
} from '#lib/core/schedule.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { NOW, testCtx } from '#test/ctx.js';

const MIN = 60_000;
const alarm = { in_minutes: 10, label: 'Stretch', tone: 'chime' };

describe('addUserAlarm', () => {
	test('stores a pending alarm made by the user and tells the open screens', async () => {
		const { ctx, repo, hints } = await testCtx();
		const row = await addUserAlarm(ctx, alarm, 'UTC');
		expect(row).toMatchObject({
			kind: 'alarm',
			createdBy: 'user',
			label: 'Stretch',
			fireAt: NOW + 10 * MIN
		});
		expect(await repo.schedule.pending()).toHaveLength(1);
		expect(hints).toEqual([{ type: 'schedule' }]);
	});

	test.each([
		['a body that is not an object', null],
		['a tone that is not a name', { ...alarm, tone: 5 }],
		['no label', { in_minutes: 10 }],
		['no time', { label: 'x' }]
	])('%s answers 400', async (_name, body) => {
		const { ctx } = await testCtx();
		await expect(addUserAlarm(ctx, body, 'UTC')).rejects.toMatchObject({ status: 400 });
	});

	test('refuses an alarm beyond the limit', async () => {
		const { ctx } = await testCtx();
		for (let i = 0; i < SCHEDULE_LIMITS.maxAlarms; i++) await addUserAlarm(ctx, alarm, 'UTC');
		await expect(addUserAlarm(ctx, alarm, 'UTC')).rejects.toMatchObject({ status: 400 });
	});
});

describe('scheduleOverview', () => {
	test('splits alarms from wakeups and leaves out what is over', async () => {
		const { ctx, repo } = await testCtx();
		const kept = await addUserAlarm(ctx, alarm, 'UTC');
		const gone = await addUserAlarm(ctx, alarm, 'UTC');
		await cancelEntry(ctx, gone.id);
		await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + 30 * MIN,
			note: 'check in',
			createdBy: 'agent',
			createdAt: NOW
		});
		const overview = await scheduleOverview(ctx);
		expect(overview.alarms.map((a) => a.id)).toEqual([kept.id]);
		expect(overview.wakeups).toMatchObject([{ note: 'check in', fireAt: NOW + 30 * MIN }]);
	});

	test('an alarm keeps its tone, repeat and duration for the client', async () => {
		const { ctx, repo } = await testCtx();
		await addUserAlarm(ctx, { ...alarm, duration_minutes: 2 }, 'UTC');
		expect(alarmsOf(await repo.schedule.pending())[0]).toMatchObject({
			label: 'Stretch',
			repeat: 'none',
			durationMin: 2,
			createdBy: 'user'
		});
	});
});

describe('cancelEntry', () => {
	test('cancels a pending entry once and tells the screens only then', async () => {
		const { ctx, hints } = await testCtx();
		const row = await addUserAlarm(ctx, alarm, 'UTC');
		hints.length = 0;
		expect(await cancelEntry(ctx, row.id)).not.toBeNull();
		expect(await cancelEntry(ctx, row.id)).toBeNull();
		expect(hints).toEqual([{ type: 'schedule' }]);
	});
});

describe('fireDue', () => {
	test('rings an alarm that is due, logs alarm.fired and retires a one-off', async () => {
		const { ctx, repo, hints, state } = await testCtx();
		const row = await addUserAlarm(ctx, alarm, 'UTC');
		state.now = NOW + 10 * MIN;
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints.map((hint) => hint.type)).toEqual(['alarm', 'schedule']);
		expect(await repo.schedule.pending()).toEqual([]);
		expect((await repo.events.recent(1))[0]).toMatchObject({
			type: 'alarm.fired',
			key: `alarm:${row.id}:${row.fireAt}`
		});
	});

	test('does nothing before the time', async () => {
		const { ctx, hints } = await testCtx();
		await addUserAlarm(ctx, alarm, 'UTC');
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints).toEqual([]);
	});

	test('an entry more than ten minutes late is retired without ringing', async () => {
		const { ctx, repo, hints, state } = await testCtx();
		await addUserAlarm(ctx, alarm, 'UTC');
		state.now = NOW + 10 * MIN + SCHEDULE_LIMITS.lateMs + 1;
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints.filter((hint) => hint.type === 'alarm')).toEqual([]);
		expect(await repo.schedule.pending()).toEqual([]);
	});

	test('a daily alarm moves on to the next day instead of ending', async () => {
		const { ctx, repo, state } = await testCtx();
		await addUserAlarm(ctx, { at: '09:30', label: 'Meds', tone: 'chime', repeat: 'daily' }, 'UTC');
		const [first] = await repo.schedule.pending();
		state.now = first.fireAt;
		await fireDue(ctx, 'UTC');
		const [next] = await repo.schedule.pending();
		expect(next.id).toBe(first.id);
		expect(next.fireAt).toBe(first.fireAt + 24 * 60 * MIN);
	});

	test('a wakeup is logged with its note and never rings', async () => {
		const { ctx, repo, hints, state } = await testCtx();
		await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + MIN,
			note: 'check the plan',
			createdBy: 'agent',
			createdAt: NOW
		});
		state.now = NOW + MIN;
		await fireDue(ctx, 'UTC');
		expect(hints.map((hint) => hint.type)).toEqual(['schedule']);
		expect((await repo.events.recent(1))[0]).toMatchObject({
			type: 'wakeup.fired',
			payload: { note: 'check the plan' }
		});
	});
});

describe('runScheduleTool', () => {
	const settings = async () => (await testCtx()).repo.settings.get();

	test('a wakeup less than five minutes ahead is refused', async () => {
		const { ctx } = await testCtx();
		const result = await runScheduleTool(
			ctx,
			await settings(),
			'schedule_wakeup',
			JSON.stringify({ in_minutes: 2, note: 'x' }),
			true
		);
		expect(result).toMatchObject({ error: expect.stringContaining('5 minutes') });
	});

	test('the agent schedules a wakeup for itself', async () => {
		const { ctx, repo } = await testCtx();
		const result = await runScheduleTool(
			ctx,
			await repo.settings.get(),
			'schedule_wakeup',
			JSON.stringify({ in_minutes: 30, note: 'ask how it went' }),
			true
		);
		expect(result).toMatchObject({ scheduled: expect.any(String) });
		expect((await repo.schedule.pending())[0]).toMatchObject({
			kind: 'wakeup',
			createdBy: 'agent'
		});
	});

	test('play_tone reports whether a screen heard it', async () => {
		const { ctx, repo } = await testCtx();
		const result = await runScheduleTool(
			ctx,
			await repo.settings.get(),
			'play_tone',
			JSON.stringify({ tone: 'chime' }),
			true
		);
		expect(result).toEqual({ played: true });
	});

	test('only three custom tones a day, then the named ones', async () => {
		const { ctx, repo } = await testCtx();
		const settings = await repo.settings.get();
		const custom = JSON.stringify({
			tone: { wave: 'sine', notes: [{ hz: 440, ms: 200 }] }
		});
		const answers = [];
		for (let i = 0; i < 4; i++)
			answers.push(await runScheduleTool(ctx, settings, 'play_tone', custom, true));
		expect(answers.slice(0, 3)).toEqual([{ played: true }, { played: true }, { played: true }]);
		expect(answers[3]).toMatchObject({ error: expect.stringContaining('custom tones') });
	});

	test('an unknown tool and broken arguments answer with an error', async () => {
		const { ctx, repo } = await testCtx();
		const settings = await repo.settings.get();
		expect(await runScheduleTool(ctx, settings, 'nope', '{}', true)).toEqual({
			error: 'unknown tool'
		});
		expect(await runScheduleTool(ctx, settings, 'set_alarm', '{', true)).toMatchObject({
			error: expect.any(String)
		});
	});
});
