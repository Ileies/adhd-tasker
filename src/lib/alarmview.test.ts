/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Alarm } from '#lib/app.svelte.js';
import {
	QUICK_TIMERS,
	alarmDayState,
	alarmStatus,
	stackCards,
	dayPanelAlarms,
	durationChoices,
	groupAlarms,
	restoreFields,
	timerFields,
	toneLabel
} from '#lib/alarmview.js';

const alarm = (fireAt: number, extra: Partial<Alarm> = {}): Alarm => ({
	id: 1,
	fireAt,
	label: 'Leave',
	tone: 'wake',
	repeat: 'none',
	durationMin: 5,
	enabled: true,
	createdBy: 'user',
	...extra
});

const now = Date.parse('2026-10-15T12:00:00Z');

describe('quick timers', () => {
	test('offer 5, 10, 25 minutes and an hour', () => {
		expect(QUICK_TIMERS.map((t) => t.minutes)).toEqual([5, 10, 25, 60]);
	});

	test('a timer is a one-off alarm labeled Timer', () => {
		expect(timerFields(25)).toMatchObject({ in_minutes: 25, label: 'Timer', repeat: 'none' });
	});
});

describe('durationChoices', () => {
	test('the usual durations include the 5 minute default', () => {
		expect(durationChoices(5)).toEqual([1, 5, 10, 15, 30]);
	});

	test('a duration set elsewhere gets its own chip in order', () => {
		expect(durationChoices(12)).toEqual([1, 5, 10, 12, 15, 30]);
	});
});

describe('groupAlarms', () => {
	test('today and later, each in time order', () => {
		const late = alarm(now + 3 * 3_600_000, { id: 1 });
		const soon = alarm(now + 3_600_000, { id: 2 });
		const tomorrow = alarm(now + 26 * 3_600_000, { id: 3 });
		const { today, later } = groupAlarms([late, tomorrow, soon], now, 'UTC');
		expect(today.map((a) => a.id)).toEqual([2, 1]);
		expect(later.map((a) => a.id)).toEqual([3]);
	});

	test('today is the day in the user timezone', () => {
		const { today } = groupAlarms([alarm(Date.parse('2026-10-15T20:00:00Z'))], now, 'Asia/Tokyo');
		expect(today).toHaveLength(0);
	});
});

describe('restoreFields', () => {
	test('a one-off comes back as minutes from now, at least one', () => {
		expect(restoreFields(alarm(now + 10 * 60_000), now, 'UTC')).toMatchObject({
			in_minutes: 10,
			repeat: 'none'
		});
		expect(restoreFields(alarm(now + 1000), now, 'UTC')).toMatchObject({ in_minutes: 1 });
	});

	test('a repeating alarm comes back at its clock time in the user timezone', () => {
		const fields = restoreFields(
			alarm(Date.parse('2026-10-16T07:30:00Z'), { repeat: 'daily' }),
			now,
			'UTC'
		);
		expect(fields).toMatchObject({ at: '07:30', repeat: 'daily', duration_minutes: 5 });
		expect(fields.in_minutes).toBeUndefined();
	});

	test('a custom tone falls back to the chime', () => {
		const custom = { wave: 'sine', notes: [] } as unknown as Alarm['tone'];
		expect(restoreFields(alarm(now + 60_000, { tone: custom }), now, 'UTC').tone).toBe('chime');
	});
});

describe('toneLabel', () => {
	test('is the name without the description', () => {
		expect(toneLabel('wake')).toBe('Wake');
	});
});

describe('alarmDayState', () => {
	// 2026-10-15 is a Thursday, 2026-10-17 a Saturday
	const at = (date: string) => Date.parse(`${date}T07:00:00Z`);

	test.each([
		['a one-off on its own day', alarm(at('2026-10-15')), '2026-10-15', 'on-day'],
		['a one-off on another day', alarm(at('2026-10-15')), '2026-10-16', 'other-day'],
		[
			'a daily alarm on a later day',
			alarm(at('2026-10-15'), { repeat: 'daily' }),
			'2026-10-20',
			'on-day'
		],
		[
			'a daily alarm before its next ring',
			alarm(at('2026-10-15'), { repeat: 'daily' }),
			'2026-10-14',
			'other-day'
		],
		[
			'a weekday alarm on a weekday',
			alarm(at('2026-10-15'), { repeat: 'weekdays' }),
			'2026-10-16',
			'on-day'
		],
		[
			'a weekday alarm on a Saturday',
			alarm(at('2026-10-15'), { repeat: 'weekdays' }),
			'2026-10-17',
			'other-day'
		],
		[
			'an alarm that is off on its own day',
			alarm(at('2026-10-15'), { enabled: false }),
			'2026-10-15',
			'off'
		],
		[
			'a daily alarm that is off',
			alarm(at('2026-10-15'), { repeat: 'daily', enabled: false }),
			'2026-10-16',
			'off'
		]
	] as const)('%s is %s', (_name, entry, date, expected) => {
		expect(alarmDayState(entry, date, 'UTC')).toBe(expected);
	});

	test('follows the user timezone, not UTC', () => {
		// 23:30 UTC on the 15th is already the 16th in Berlin
		const late = alarm(Date.parse('2026-10-15T23:30:00Z'));
		expect(alarmDayState(late, '2026-10-16', 'Europe/Berlin')).toBe('on-day');
	});
});

describe('dayPanelAlarms', () => {
	test('rings that day first, then other days, then off, each by clock time', () => {
		const at = (hhmm: string, date = '2026-10-15') => Date.parse(`${date}T${hhmm}:00Z`);
		const listed = dayPanelAlarms(
			[
				alarm(at('06:00'), { id: 1, enabled: false }),
				alarm(at('09:00', '2026-10-20'), { id: 2 }),
				alarm(at('12:00'), { id: 3 }),
				alarm(at('07:30'), { id: 4 })
			],
			'2026-10-15',
			'UTC'
		);
		expect(listed.map((entry) => [entry.alarm.id, entry.state])).toEqual([
			[4, 'on-day'],
			[3, 'on-day'],
			[2, 'other-day'],
			[1, 'off']
		]);
		expect(listed[0].minutes).toBe(450);
	});
});

describe('stackCards', () => {
	test('a card sits centered on its time when there is room', () => {
		expect(stackCards([100, 300], 40)).toEqual([80, 280]);
	});

	test('cards that would overlap are pushed down in order', () => {
		expect(stackCards([100, 105, 110], 40, 4)).toEqual([80, 124, 168]);
	});

	test('the first card never goes above the top', () => {
		expect(stackCards([5], 40)).toEqual([0]);
	});
});

describe('alarmStatus', () => {
	test.each([
		['on-day', 'none', 'Rings this day'],
		['on-day', 'daily', 'Every day'],
		['off', 'daily', 'Off'],
		['other-day', 'daily', 'Every day'],
		['other-day', 'weekdays', 'Monday to Friday'],
		['other-day', 'none', 'Next Fri, Oct 16']
	] as const)('%s with repeat %s says "%s"', (state, repeat, text) => {
		expect(alarmStatus(alarm(0, { repeat }), state, 'Fri, Oct 16')).toBe(text);
	});
});
