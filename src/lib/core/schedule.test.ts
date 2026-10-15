/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	addUserAlarm,
	alarmsOf,
	cancelEntry,
	fireDue,
	runScheduleTool,
	scheduleOverview,
	setAlarmEnabled,
	updateUserAlarm
} from '#lib/core/schedule.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { NOW, testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';

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
		expect(await failureOf(addUserAlarm(ctx, body, 'UTC'))).toMatchObject({ status: 400 });
	});

	test('refuses an alarm beyond the limit', async () => {
		const { ctx } = await testCtx();
		for (let i = 0; i < SCHEDULE_LIMITS.maxAlarms; i++)
			await addUserAlarm(ctx, { ...alarm, in_minutes: 10 + i }, 'UTC');
		expect(await failureOf(addUserAlarm(ctx, { ...alarm, in_minutes: 60 }, 'UTC'))).toMatchObject({
			status: 400
		});
	});

	test('refuses a time that already has an alarm, on or off', async () => {
		const { ctx } = await testCtx();
		const first = await addUserAlarm(ctx, alarm, 'UTC');
		await setAlarmEnabled(ctx, first.id, false, 'UTC');
		expect(await failureOf(addUserAlarm(ctx, alarm, 'UTC'))).toMatchObject({
			status: 400,
			message: expect.stringContaining('already an alarm')
		});
	});

	test('allows an alarm one minute away from another', async () => {
		const { ctx, repo } = await testCtx();
		await addUserAlarm(ctx, alarm, 'UTC');
		await addUserAlarm(ctx, { ...alarm, in_minutes: 11 }, 'UTC');
		expect(await repo.schedule.pending()).toHaveLength(2);
	});

	test('editing an alarm onto another one is refused, onto itself is fine', async () => {
		const { ctx } = await testCtx();
		const a = await addUserAlarm(ctx, alarm, 'UTC');
		await addUserAlarm(ctx, { ...alarm, in_minutes: 20 }, 'UTC');
		await updateUserAlarm(ctx, a.id, { ...alarm, label: 'Renamed' }, 'UTC');
		expect(
			await failureOf(updateUserAlarm(ctx, a.id, { ...alarm, in_minutes: 20 }, 'UTC'))
		).toMatchObject({ status: 400 });
	});
});

describe('scheduleOverview', () => {
	test('splits alarms from wakeups and leaves out what is over', async () => {
		const { ctx, repo } = await testCtx();
		const kept = await addUserAlarm(ctx, alarm, 'UTC');
		const gone = await addUserAlarm(ctx, { ...alarm, in_minutes: 15 }, 'UTC');
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

describe('setAlarmEnabled', () => {
	const daily = { at: '09:30', label: 'Meds', tone: 'chime', repeat: 'daily' };

	test('an alarm that is off stays listed, shows as off and never rings', async () => {
		const { ctx, repo, hints, state } = await testCtx();
		const row = await addUserAlarm(ctx, daily, 'UTC');
		await setAlarmEnabled(ctx, row.id, false, 'UTC');
		expect(alarmsOf(await repo.schedule.pending())[0]).toMatchObject({
			id: row.id,
			enabled: false
		});
		state.now = row.fireAt;
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints).toEqual([]);
	});

	test('turning it on again rings it at its time and tells the screens', async () => {
		const { ctx, hints, state } = await testCtx();
		const row = await addUserAlarm(ctx, daily, 'UTC');
		await setAlarmEnabled(ctx, row.id, false, 'UTC');
		hints.length = 0;
		await setAlarmEnabled(ctx, row.id, true, 'UTC');
		expect(hints).toEqual([{ type: 'schedule' }]);
		state.now = row.fireAt;
		await fireDue(ctx, 'UTC');
		expect(hints.map((hint) => hint.type)).toContain('alarm');
	});

	test('a clock alarm whose time passed while it was off waits for its next time', async () => {
		const { ctx, repo, state } = await testCtx();
		const row = await addUserAlarm(ctx, daily, 'UTC');
		await setAlarmEnabled(ctx, row.id, false, 'UTC');
		state.now = row.fireAt + 3 * 60 * MIN;
		await setAlarmEnabled(ctx, row.id, true, 'UTC');
		expect((await repo.schedule.pending())[0].fireAt).toBe(row.fireAt + 24 * 60 * MIN);
	});

	test('a timer that ran out while it was off cannot be turned on', async () => {
		const { ctx, state } = await testCtx();
		const row = await addUserAlarm(ctx, alarm, 'UTC');
		await setAlarmEnabled(ctx, row.id, false, 'UTC');
		state.now = row.fireAt + MIN;
		expect(await failureOf(setAlarmEnabled(ctx, row.id, true, 'UTC'))).toMatchObject({
			status: 400
		});
	});

	test('answers null for a wakeup or an id that is not pending', async () => {
		const { ctx, repo } = await testCtx();
		const wakeup = await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + 30 * MIN,
			note: 'x',
			createdBy: 'agent',
			createdAt: NOW
		});
		expect(await setAlarmEnabled(ctx, wakeup.id, false, 'UTC')).toBeNull();
		expect(await setAlarmEnabled(ctx, 999, false, 'UTC')).toBeNull();
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

describe('runScheduleTool limits', () => {
	const run = async (
		made: Awaited<ReturnType<typeof testCtx>>,
		name: string,
		args: unknown,
		fromChat = false
	) =>
		runScheduleTool(made.ctx, await made.repo.settings.get(), name, JSON.stringify(args), fromChat);
	const wakeup = (made: Awaited<ReturnType<typeof testCtx>>, at: number) =>
		made.repo.schedule.insert({
			kind: 'wakeup',
			fireAt: at,
			note: 'later',
			createdBy: 'agent',
			createdAt: NOW
		});

	test('a wakeup in quiet hours is refused unless the user asked in the chat', async () => {
		const made = await testCtx();
		const late = { in_minutes: 14 * 60, note: 'check in' }; // 23:00, inside 22:00 to 07:00
		expect(await run(made, 'schedule_wakeup', late)).toMatchObject({
			error: expect.stringContaining('quiet hours')
		});
		expect(await made.repo.schedule.pending()).toEqual([]);
		expect(await run(made, 'schedule_wakeup', late, true)).toMatchObject({
			scheduled: expect.any(String)
		});
	});

	test('at most ten pending wakeups, the answer lists them', async () => {
		const made = await testCtx();
		for (let i = 0; i < SCHEDULE_LIMITS.maxWakeups; i++) await wakeup(made, NOW + (10 + i) * MIN);
		const result = await run(made, 'schedule_wakeup', { in_minutes: 60, note: 'one more' });
		expect(result).toMatchObject({ error: expect.stringContaining('at most 10') });
		expect((result as { pending: string[] }).pending).toHaveLength(SCHEDULE_LIMITS.maxWakeups);
	});

	test('at most thirty alarms for the agent too', async () => {
		const made = await testCtx();
		for (let i = 0; i < SCHEDULE_LIMITS.maxAlarms; i++)
			await addUserAlarm(made.ctx, { ...alarm, in_minutes: 10 + i }, 'UTC');
		expect(await run(made, 'set_alarm', { ...alarm, in_minutes: 60 })).toMatchObject({
			error: expect.stringContaining('at most 30 alarms')
		});
	});

	test('the agent cannot set an alarm at a time that has one', async () => {
		const made = await testCtx();
		await addUserAlarm(made.ctx, alarm, 'UTC');
		expect(await run(made, 'set_alarm', alarm)).toMatchObject({
			error: expect.stringContaining('already an alarm')
		});
	});

	test('custom tones are counted through usage and come back the next day', async () => {
		const made = await testCtx();
		const custom = { tone: { wave: 'sine', notes: [{ hz: 440, ms: 200, rest: null }] } };
		for (let i = 0; i < 3; i++)
			expect(await run(made, 'play_tone', custom)).toEqual({ played: true });
		expect(await made.repo.usage.countSince('tone', 0)).toBe(3);
		expect(await run(made, 'play_tone', custom)).toMatchObject({
			error: expect.stringContaining('custom tones')
		});
		made.state.now = NOW + 24 * 60 * MIN;
		expect(await run(made, 'play_tone', custom)).toEqual({ played: true });
	});

	test('a named tone never counts against the custom limit', async () => {
		const made = await testCtx();
		for (let i = 0; i < 5; i++)
			expect(await run(made, 'play_tone', { tone: 'chime' })).toEqual({ played: true });
		expect(await made.repo.usage.countSince('tone', 0)).toBe(0);
	});

	test('play_tone says so when no screen is open', async () => {
		const made = await testCtx();
		made.state.screens = 0;
		expect(await run(made, 'play_tone', { tone: 'chime' })).toMatchObject({ played: false });
	});

	test('cancel_schedule of an entry that is not pending is "no such pending entry"', async () => {
		const made = await testCtx();
		expect(await run(made, 'cancel_schedule', { id: 999 })).toEqual({
			error: 'no such pending entry'
		});
		const row = await addUserAlarm(made.ctx, alarm, 'UTC');
		expect(await run(made, 'cancel_schedule', { id: row.id })).toMatchObject({
			cancelled: expect.any(String)
		});
		expect(await run(made, 'cancel_schedule', { id: row.id })).toEqual({
			error: 'no such pending entry'
		});
	});

	test('broken arguments answer with an error for every tool', async () => {
		const made = await testCtx();
		const settings = await made.repo.settings.get();
		for (const name of ['schedule_wakeup', 'set_alarm', 'play_tone', 'cancel_schedule'])
			expect(await runScheduleTool(made.ctx, settings, name, '{', true)).toEqual({
				error: 'arguments were not valid JSON'
			});
	});
});

describe('fireDue guarantees', () => {
	test('a second call at the same moment rings nothing', async () => {
		const { ctx, hints, state } = await testCtx();
		await addUserAlarm(ctx, alarm, 'UTC');
		state.now = NOW + 10 * MIN;
		await fireDue(ctx, 'UTC');
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints).toEqual([]);
	});

	test('a daily alarm keeps its local time across the end of daylight saving', async () => {
		const start = Date.parse('2026-10-24T06:00:00Z'); // 08:00 in Berlin, the clocks go back that night
		const { ctx, repo, state } = await testCtx({ now: start });
		await addUserAlarm(
			ctx,
			{ at: '09:30', label: 'Meds', tone: 'chime', repeat: 'daily' },
			'Europe/Berlin'
		);
		const [first] = await repo.schedule.pending();
		expect(first.fireAt).toBe(Date.parse('2026-10-24T07:30:00Z'));
		state.now = first.fireAt;
		await fireDue(ctx, 'Europe/Berlin');
		const [next] = await repo.schedule.pending();
		expect(next.fireAt).toBe(Date.parse('2026-10-25T08:30:00Z')); // 09:30 again, 25 hours later
	});

	test('a failing announcement the first time does not make the alarm ring again', async () => {
		const { ctx, repo, hints, state } = await testCtx();
		await addUserAlarm(ctx, alarm, 'UTC');
		state.now = NOW + 10 * MIN;
		const original = ctx.hint;
		ctx.hint = () => {
			throw new Error('stream broke');
		};
		await fireDue(ctx, 'UTC').catch(() => {});
		ctx.hint = original;
		hints.length = 0;
		await fireDue(ctx, 'UTC');
		expect(hints.filter((hint) => hint.type === 'alarm')).toEqual([]);
		expect(await repo.schedule.pending()).toEqual([]);
	});

	test('a wakeup is logged once under its own key', async () => {
		const { ctx, repo, state } = await testCtx();
		const row = await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + MIN,
			note: 'n',
			createdBy: 'agent',
			createdAt: NOW
		});
		state.now = NOW + MIN;
		await fireDue(ctx, 'UTC');
		expect((await repo.events.recent(5)).map((event) => event.key)).toEqual([`wakeup:${row.id}`]);
	});
});

describe('updateUserAlarm', () => {
	const daily = { at: '09:30', label: 'Meds', tone: 'urgent', repeat: 'daily' };

	test('changes label, time and repeat, keeps the tone and the on/off state', async () => {
		const { ctx, repo, hints } = await testCtx();
		const row = await addUserAlarm(ctx, daily, 'UTC');
		await setAlarmEnabled(ctx, row.id, false, 'UTC');
		hints.length = 0;
		await updateUserAlarm(ctx, row.id, { at: '10:15', label: 'Pills', repeat: 'weekdays' }, 'UTC');
		expect((await repo.schedule.pending())[0]).toMatchObject({
			label: 'Pills',
			minutes: 10 * 60 + 15,
			repeat: 'weekdays',
			tone: 'urgent',
			enabled: false
		});
		expect(hints).toEqual([{ type: 'schedule' }]);
	});

	test('answers null for an alarm that is not pending', async () => {
		const { ctx } = await testCtx();
		expect(await updateUserAlarm(ctx, 999, daily, 'UTC')).toBeNull();
	});

	test('refuses a body without a label', async () => {
		const { ctx } = await testCtx();
		const row = await addUserAlarm(ctx, daily, 'UTC');
		expect(await failureOf(updateUserAlarm(ctx, row.id, { at: '10:00' }, 'UTC'))).toMatchObject({
			status: 400
		});
	});
});
