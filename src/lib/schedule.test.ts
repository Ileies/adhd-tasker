/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { SCHEDULE_LIMITS, describeEntry, minutesOf, nextRepeat, parseAlarm, parseWakeup, resolveWhen } from '#lib/schedule.js';
import { zonedToEpoch } from '#lib/time.js';

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
		expect(resolveWhen({ in_minutes: 30 }, NOW, BERLIN)).toEqual({ ok: true, value: { fireAt: NOW + 30 * 60_000, minutes: null } });
		expect(resolveWhen({ in_minutes: 0 }, NOW, BERLIN).ok).toBe(false);
		expect(resolveWhen({ in_minutes: 1.5 }, NOW, BERLIN).ok).toBe(false);
	});

	test('a clock time is today when still ahead, else tomorrow', () => {
		expect(resolveWhen({ at: '15:40' }, NOW, BERLIN)).toEqual({ ok: true, value: { fireAt: zonedToEpoch('2026-10-14', 940, BERLIN), minutes: 940 } });
		expect(resolveWhen({ at: '09:00' }, NOW, BERLIN)).toEqual({ ok: true, value: { fireAt: zonedToEpoch('2026-10-15', 540, BERLIN), minutes: 540 } });
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
		expect(resolveWhen({ in_minutes: SCHEDULE_LIMITS.maxAheadDays * 1440 + 1 }, NOW, BERLIN).ok).toBe(false);
	});
});

describe('nextRepeat', () => {
	test('daily rings at the same local time across daylight saving', () => {
		const first = zonedToEpoch('2026-10-24', 480, BERLIN);
		expect(nextRepeat('daily', 480, first, BERLIN)).toBe(zonedToEpoch('2026-10-25', 480, BERLIN));
		expect(nextRepeat('daily', 480, zonedToEpoch('2026-10-25', 480, BERLIN), BERLIN)).toBe(Date.parse('2026-10-26T07:00:00Z'));
	});

	test('weekdays skip the weekend', () => {
		// 2026-10-16 is a Friday
		const friday = zonedToEpoch('2026-10-16', 480, BERLIN);
		expect(nextRepeat('weekdays', 480, friday, BERLIN)).toBe(zonedToEpoch('2026-10-19', 480, BERLIN));
	});

	test('a one-off does not repeat, and the result is always in the future', () => {
		expect(nextRepeat('none', 480, NOW, BERLIN)).toBeNull();
		expect(nextRepeat('daily', 600, NOW, BERLIN)).toBe(zonedToEpoch('2026-10-15', 600, BERLIN));
	});
});

describe('parseAlarm', () => {
	test('a minimal alarm gets the default tone and no repeat', () => {
		const result = parseAlarm({ at: '15:00', label: 'Leave now' }, NOW, BERLIN);
		expect(result.ok && result.value).toMatchObject({ label: 'Leave now', tone: 'chime', custom: false, repeat: 'none', minutes: 900 });
	});

	test('needs a label, a valid tone and a clock time for repeats', () => {
		expect(parseAlarm({ at: '15:00' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ at: '15:00', label: 'x', tone: 'airhorn' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ in_minutes: 20, label: 'x', repeat: 'daily' }, NOW, BERLIN).ok).toBe(false);
		expect(parseAlarm({ at: '15:00', label: 'x', repeat: 'hourly' }, NOW, BERLIN).ok).toBe(false);
	});

	test('flags custom tones so the caller can count them', () => {
		const result = parseAlarm({ at: '15:00', label: 'x', tone: { wave: 'sine', notes: [{ hz: 440, ms: 200 }] } }, NOW, BERLIN);
		expect(result.ok && result.value.custom).toBe(true);
	});

	test('trims and caps the label', () => {
		const result = parseAlarm({ at: '15:00', label: '  ' + 'a'.repeat(100) }, NOW, BERLIN);
		expect(result.ok && result.value.label.length).toBe(SCHEDULE_LIMITS.maxLabel);
	});
});

describe('parseWakeup', () => {
	test('needs a note and at least five minutes', () => {
		expect(parseWakeup({ in_minutes: 30, note: 'Check the dentist call' }, NOW, BERLIN).ok).toBe(true);
		expect(parseWakeup({ in_minutes: 3, note: 'soon' }, NOW, BERLIN).ok).toBe(false);
		expect(parseWakeup({ in_minutes: 30 }, NOW, BERLIN).ok).toBe(false);
	});
});

describe('describeEntry', () => {
	test('one line with the local time', () => {
		const line = describeEntry({ id: 4, kind: 'alarm', fireAt: NOW, label: 'Leave now', note: null, repeat: 'daily', createdBy: 'user' }, BERLIN);
		expect(line).toBe('#4 2026-10-14 10:00 alarm "Leave now", Every day (by user)');
	});
});
