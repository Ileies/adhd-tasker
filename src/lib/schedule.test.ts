/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	SCHEDULE_LIMITS,
	describeEntry,
	minutesOf,
	nextRepeat,
	parseAlarm,
	parseId,
	parseWakeup,
	parseRepeat,
	resolveWhen,
	repeatDays,
	repeatFromDays,
	repeatText,
	type Repeat
} from '#lib/schedule.js';
import { todayIn, zonedToEpoch } from '#lib/time.js';

const BERLIN = 'Europe/Berlin';
// 2026-10-14 10:00 in Berlin (CEST, UTC+2)
const NOW = Date.parse('2026-10-14T08:00:00Z');

describe('zonedToEpoch', () => {
	test('applies the offset of the timezone', () => {
		expect(zonedToEpoch('2026-10-14', 600, BERLIN)).toBe(NOW);
		expect(zonedToEpoch('2026-10-14', 600, 'UTC')).toBe(Date.parse('2026-10-14T10:00:00Z'));
		expect(zonedToEpoch('2026-01-14', 600, BERLIN)).toBe(Date.parse('2026-01-14T09:00:00Z'));
	});

	test('follows daylight saving, the clocks went back on 2026-10-25', () => {
		expect(zonedToEpoch('2026-10-24', 480, BERLIN)).toBe(Date.parse('2026-10-24T06:00:00Z'));
		expect(zonedToEpoch('2026-10-26', 480, BERLIN)).toBe(Date.parse('2026-10-26T07:00:00Z'));
	});
});

describe('minutesOf', () => {
	test('reads the local clock', () => {
		expect(minutesOf(NOW, BERLIN)).toBe(600);
		expect(minutesOf(NOW, 'UTC')).toBe(480);
	});
});

describe('resolveWhen', () => {
	test('in_minutes', () => {
		expect(resolveWhen({ in_minutes: 30 }, NOW, BERLIN)).toEqual({
			ok: true,
			value: { fireAt: NOW + 30 * 60_000, minutes: null }
		});
		expect(resolveWhen({ in_minutes: 0 }, NOW, BERLIN).ok).toBe(false);
		expect(resolveWhen({ in_minutes: 1.5 }, NOW, BERLIN).ok).toBe(false);
	});

	test('a clock time is today when still ahead, else tomorrow', () => {
		expect(resolveWhen({ at: '15:40' }, NOW, BERLIN)).toEqual({
			ok: true,
			value: { fireAt: zonedToEpoch('2026-10-14', 940, BERLIN), minutes: 940 }
		});
		expect(resolveWhen({ at: '09:00' }, NOW, BERLIN)).toEqual({
			ok: true,
			value: { fireAt: zonedToEpoch('2026-10-15', 540, BERLIN), minutes: 540 }
		});
	});

	test('an explicit date', () => {
		const result = resolveWhen({ at: '08:00', date: '2026-10-16' }, NOW, BERLIN);
		expect(result.ok && result.value.fireAt).toBe(zonedToEpoch('2026-10-16', 480, BERLIN));
		expect(resolveWhen({ at: '08:00', date: '2026-10-10' }, NOW, BERLIN).ok).toBe(false);
	});

	test('rejects bad input and anything beyond the horizon', () => {
		expect(resolveWhen({}, NOW, BERLIN).ok).toBe(false);
		expect(resolveWhen({ at: '25:00' }, NOW, BERLIN).ok).toBe(false);
		expect(resolveWhen({ at: '08:00', date: 'tomorrow' }, NOW, BERLIN).ok).toBe(false);
		expect(
			resolveWhen({ in_minutes: SCHEDULE_LIMITS.maxAheadDays * 1440 + 1 }, NOW, BERLIN).ok
		).toBe(false);
	});
});

describe('nextRepeat', () => {
	test('daily rings at the same local time across daylight saving', () => {
		const first = zonedToEpoch('2026-10-24', 480, BERLIN);
		expect(nextRepeat('daily', 480, first, BERLIN)).toBe(zonedToEpoch('2026-10-25', 480, BERLIN));
		expect(nextRepeat('daily', 480, zonedToEpoch('2026-10-25', 480, BERLIN), BERLIN)).toBe(
			Date.parse('2026-10-26T07:00:00Z')
		);
	});

	test('weekdays skip the weekend', () => {
		// 2026-10-16 is a Friday
		const friday = zonedToEpoch('2026-10-16', 480, BERLIN);
		expect(nextRepeat('weekdays', 480, friday, BERLIN)).toBe(
			zonedToEpoch('2026-10-19', 480, BERLIN)
		);
	});

	test('chosen weekdays skip the others', () => {
		// 2026-10-16 is a Friday, Wed to Fri rings again the next Wednesday, Saturday only on the next Saturday
		const friday = zonedToEpoch('2026-10-16', 480, BERLIN);
		expect(nextRepeat('days:3,4,5', 480, friday, BERLIN)).toBe(
			zonedToEpoch('2026-10-21', 480, BERLIN)
		);
		expect(nextRepeat('days:6', 480, friday, BERLIN)).toBe(zonedToEpoch('2026-10-17', 480, BERLIN));
		expect(nextRepeat('days:6', 480, zonedToEpoch('2026-10-17', 480, BERLIN), BERLIN)).toBe(
			zonedToEpoch('2026-10-24', 480, BERLIN)
		);
	});

	test('a one-off does not repeat, and the result is always in the future', () => {
		expect(nextRepeat('none', 480, NOW, BERLIN)).toBeNull();
		expect(nextRepeat('daily', 600, NOW, BERLIN)).toBe(zonedToEpoch('2026-10-15', 600, BERLIN));
	});
});

describe('parseAlarm', () => {
	test('a minimal alarm gets the default tone and no repeat', () => {
		const result = parseAlarm({ at: '15:00', label: 'Leave now' }, NOW, BERLIN);
		expect(result.ok && result.value).toMatchObject({
			label: 'Leave now',
			tone: 'chime',
			custom: false,
			repeat: 'none',
			minutes: 900
		});
	});

	test('rings for 5 minutes unless told otherwise', () => {
		const result = parseAlarm({ at: '15:00', label: 'x' }, NOW, BERLIN);
		expect(result.ok && result.value.durationMin).toBe(5);
	});

	test.each([
		[1, true],
		[30, true],
		[0, false],
		[31, false],
		[2.5, false],
		['5', false]
	])('duration_minutes %p is accepted: %p', (value, accepted) => {
		const result = parseAlarm({ at: '15:00', label: 'x', duration_minutes: value }, NOW, BERLIN);
		expect(result.ok).toBe(accepted);
		if (result.ok) expect(result.value.durationMin).toBe(value as number);
	});

	test('needs a label, a valid tone and a clock time for repeats', () => {
		expect(parseAlarm({ at: '15:00' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ at: '15:00', label: 'x', tone: 'airhorn' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ in_minutes: 20, label: 'x', repeat: 'daily' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ at: '15:00', label: 'x', repeat: 'hourly' }, NOW, BERLIN).ok).toBe(false);
	});

	test('flags custom tones so the caller can count them', () => {
		const result = parseAlarm(
			{ at: '15:00', label: 'x', tone: { wave: 'sine', notes: [{ hz: 440, ms: 200 }] } },
			NOW,
			BERLIN
		);
		expect(result.ok && result.value.custom).toBe(true);
	});

	test('trims and caps the label', () => {
		const result = parseAlarm({ at: '15:00', label: '  ' + 'a'.repeat(100) }, NOW, BERLIN);
		expect(result.ok && result.value.label.length).toBe(SCHEDULE_LIMITS.maxLabel);
	});
});

describe('parseWakeup', () => {
	test('needs a note and at least five minutes', () => {
		expect(parseWakeup({ in_minutes: 30, note: 'Check the dentist call' }, NOW, BERLIN).ok).toBe(
			true
		);
		expect(parseWakeup({ in_minutes: 3, note: 'soon' }, NOW, BERLIN).ok).toBe(false);
		expect(parseWakeup({ in_minutes: 30 }, NOW, BERLIN).ok).toBe(false);
	});
});

describe('describeEntry', () => {
	test('one line with the local time', () => {
		const line = describeEntry(
			{
				id: 4,
				kind: 'alarm',
				fireAt: NOW,
				label: 'Leave now',
				note: null,
				repeat: 'daily',
				createdBy: 'user'
			},
			BERLIN
		);
		expect(line).toBe('#4 2026-10-14 10:00 alarm "Leave now", Every day (by user)');
	});
});

describe('parseId', () => {
	test('needs a whole number', () => {
		expect(parseId({ id: 7 })).toEqual({ ok: true, value: 7 });
		expect(parseId({ id: 7.5 }).ok).toBe(false);
		expect(parseId({ id: '7' }).ok).toBe(false);
		expect(parseId({}).ok).toBe(false);
	});
});

describe('properties', () => {
	const ZONES = ['Europe/Berlin', 'America/St_Johns', 'Asia/Kathmandu', 'Australia/Lord_Howe'];
	const zone = fc.constantFrom(...ZONES);
	const after = fc.integer({
		min: Date.parse('2026-01-01T00:00:00Z'),
		max: Date.parse('2027-12-31T00:00:00Z')
	});
	const repeat = fc.constantFrom<Repeat>('daily', 'weekdays');
	const anyMinute = fc.integer({ min: 0, max: 1439 });
	// Clock times that exist every day: the daylight saving changes of these zones all happen before 04:00
	const safeMinute = fc.integer({ min: 240, max: 1439 });
	const DAY_MS = 86_400_000;

	test('the next ring is always after the given moment', () => {
		fc.assert(
			fc.property(repeat, anyMinute, after, zone, (kind, minutes, afterMs, timezone) => {
				expect(nextRepeat(kind, minutes, afterMs, timezone)!).toBeGreaterThan(afterMs);
			})
		);
	});

	test('the ring keeps its local clock time, one day later at most (25 hours across daylight saving)', () => {
		fc.assert(
			fc.property(safeMinute, after, zone, (minutes, afterMs, timezone) => {
				const at = nextRepeat('daily', minutes, afterMs, timezone)!;
				expect(minutesOf(at, timezone)).toBe(minutes);
				expect(at - afterMs).toBeLessThanOrEqual(DAY_MS + 3_600_000);
			})
		);
	});

	test('weekdays never ring on a weekend and wait at most until Monday', () => {
		fc.assert(
			fc.property(anyMinute, after, zone, (minutes, afterMs, timezone) => {
				const at = nextRepeat('weekdays', minutes, afterMs, timezone)!;
				const weekday = new Date(todayIn(timezone, new Date(at)) + 'T00:00:00Z').getUTCDay();
				expect([0, 6]).not.toContain(weekday);
				expect(at - afterMs).toBeLessThanOrEqual(3 * DAY_MS + 3_600_000);
			})
		);
	});

	test('a one-off never repeats', () => {
		fc.assert(
			fc.property(anyMinute, after, zone, (minutes, afterMs, timezone) => {
				expect(nextRepeat('none', minutes, afterMs, timezone)).toBeNull();
			})
		);
	});
});

describe('repeat days', () => {
	test.each([
		[[], 'none'],
		[[0, 1, 2, 3, 4, 5, 6], 'daily'],
		[[5, 4, 3, 2, 1], 'weekdays'],
		[[6], 'days:6'],
		[[5, 3, 4, 3], 'days:3,4,5']
	] as const)('%j is stored as %s', (days, repeat) => {
		expect(repeatFromDays(days)).toBe(repeat);
	});

	test.each([
		['days:3,4,5', 'Wed to Fri'],
		['days:6', 'Saturday'],
		['days:2,4,0', 'Tue, Thu, Sun'],
		['days:6,0', 'Sat, Sun'],
		['weekdays', 'Monday to Friday'],
		['daily', 'Every day']
	] as const)('%s reads %s', (repeat, text) => {
		expect(repeatText(repeat)).toBe(text);
	});

	test.each([
		['days:3,4,5', 'days:3,4,5'],
		['days:6', 'days:6'],
		['days:5,3', null],
		['days:1,2,3,4,5', null],
		['days:7', null],
		['days:', null],
		['monthly', null],
		[5, null]
	] as [unknown, Repeat | null][])('parseRepeat(%j) is %j', (value, expected) => {
		expect(parseRepeat(value)).toBe(expected);
	});

	test('repeatDays lists the weekdays of every form', () => {
		expect(repeatDays('none')).toBeNull();
		expect(repeatDays('weekdays')).toEqual([1, 2, 3, 4, 5]);
		expect(repeatDays('days:6')).toEqual([6]);
	});

	test('the first ring of a Saturday alarm made on a Monday waits for Saturday', () => {
		// 2026-10-12 is a Monday
		const monday = zonedToEpoch('2026-10-12', 600, BERLIN);
		const parsed = parseAlarm({ at: '08:00', label: 'Run', repeat: 'days:6' }, monday, BERLIN);
		expect(parsed).toMatchObject({
			ok: true,
			value: { fireAt: zonedToEpoch('2026-10-17', 480, BERLIN), repeat: 'days:6' }
		});
	});

	test('a repeat that is not normalized is refused', () => {
		expect(parseAlarm({ at: '08:00', label: 'x', repeat: 'days:5,3' }, NOW, BERLIN).ok).toBe(false);
	});
});
