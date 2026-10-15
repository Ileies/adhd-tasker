/// <reference types="bun" />
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import fc from 'fast-check';
import { minutesOf } from '#lib/schedule.js';
import {
	addDays,
	clockParts,
	formatDay,
	isDateKey,
	isValidTimezone,
	localMoment,
	minutesNow,
	todayIn,
	zonedToEpoch
} from '#lib/time.js';

afterEach(() => setSystemTime());

describe('clockParts', () => {
	test('shows the wall clock of the timezone with seconds apart', () => {
		const at = new Date('2026-10-14T23:05:09Z');
		expect(clockParts('UTC', at)).toEqual({ time: '23:05', seconds: '09', period: '' });
		expect(clockParts('Asia/Tokyo', at)).toEqual({ time: '08:05', seconds: '09', period: '' });
	});

	test('midnight is 00:00, not 24:00', () => {
		expect(clockParts('UTC', new Date('2026-10-14T00:00:00Z')).time).toBe('00:00');
	});
});

describe('dates', () => {
	test('todayIn follows the timezone, not the machine', () => {
		const at = new Date('2026-10-14T23:30:00Z');
		expect(todayIn('UTC', at)).toBe('2026-10-14');
		expect(todayIn('Asia/Tokyo', at)).toBe('2026-10-15');
		expect(todayIn('America/Los_Angeles', at)).toBe('2026-10-14');
	});

	test('addDays crosses month, year and leap day boundaries', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});

	test('isDateKey rejects malformed and impossible dates', () => {
		expect(isDateKey('2026-10-14')).toBe(true);
		expect(isDateKey('2026-13-01')).toBe(false);
		expect(isDateKey('14.10.2026')).toBe(false);
		expect(isDateKey(null)).toBe(false);
	});

	test('formatDay names the days around today', () => {
		expect(formatDay('2026-10-14', '2026-10-14')).toBe('Today');
		expect(formatDay('2026-10-15', '2026-10-14')).toBe('Tomorrow');
		expect(formatDay('2026-10-13', '2026-10-14')).toBe('Yesterday');
		expect(formatDay('2026-10-16', '2026-10-14')).toBe('Fri, Oct 16');
	});
});

describe('minutesNow', () => {
	// 2026-10-14 12:00 UTC
	test.each([
		['UTC', 720],
		['Europe/Berlin', 840],
		['America/St_Johns', 570],
		['Asia/Kathmandu', 1065],
		['Pacific/Kiritimati', 120]
	])('%s reads the local clock', (timezone, expected) => {
		setSystemTime(new Date('2026-10-14T12:00:00Z'));
		expect(minutesNow(timezone)).toBe(expected);
	});

	test('an invalid timezone falls back to the device timezone', () => {
		setSystemTime(new Date('2026-10-14T12:00:00Z'));
		expect(minutesNow('Not/AZone')).toBe(minutesNow());
		expect(minutesNow(null)).toBe(minutesNow());
	});

	test('the hour never reads 24 at midnight', () => {
		setSystemTime(new Date('2026-10-14T00:05:00Z'));
		expect(minutesNow('UTC')).toBe(5);
	});
});

describe('isValidTimezone', () => {
	test('accepts IANA names and rejects anything else', () => {
		expect(isValidTimezone('Europe/Berlin')).toBe(true);
		expect(isValidTimezone('UTC')).toBe(true);
		expect(isValidTimezone('Berlin')).toBe(false);
		expect(isValidTimezone('')).toBe(false);
	});
});

describe('zonedToEpoch', () => {
	test('an invalid timezone is read as UTC', () => {
		expect(zonedToEpoch('2026-10-14', 600, 'Not/AZone')).toBe(Date.parse('2026-10-14T10:00:00Z'));
	});

	test('half hour offsets are applied', () => {
		expect(zonedToEpoch('2026-10-14', 600, 'America/St_Johns')).toBe(
			Date.parse('2026-10-14T12:30:00Z')
		);
	});

	// Pinned current behavior: a wall time that does not exist (02:00 to 02:59 on 2026-03-29 in Berlin)
	// lands one hour later, and so collides with the real 03:00 to 03:59 only for 03:00 itself.
	test('a wall time inside the spring forward gap moves one hour later', () => {
		const at = (minutes: number) => zonedToEpoch('2026-03-29', minutes, 'Europe/Berlin');
		expect(at(150)).toBe(Date.parse('2026-03-29T01:30:00Z'));
		expect(at(120)).toBe(Date.parse('2026-03-29T01:00:00Z'));
		expect(at(179)).toBe(Date.parse('2026-03-29T01:59:00Z'));
		expect(at(180)).toBe(Date.parse('2026-03-29T01:00:00Z'));
	});

	test('the wall times around the spring forward gap are exact', () => {
		expect(zonedToEpoch('2026-03-29', 119, 'Europe/Berlin')).toBe(
			Date.parse('2026-03-29T00:59:00Z')
		);
		expect(zonedToEpoch('2026-03-29', 181, 'Europe/Berlin')).toBe(
			Date.parse('2026-03-29T01:01:00Z')
		);
	});

	// Pinned current behavior: the repeated hour (02:00 to 02:59 on 2026-10-25) resolves to the later,
	// standard time occurrence.
	test('a wall time in the repeated autumn hour resolves to standard time', () => {
		const at = (minutes: number) => zonedToEpoch('2026-10-25', minutes, 'Europe/Berlin');
		expect(at(150)).toBe(Date.parse('2026-10-25T01:30:00Z'));
		expect(at(120)).toBe(Date.parse('2026-10-25T01:00:00Z'));
		expect(at(119)).toBe(Date.parse('2026-10-24T23:59:00Z'));
		expect(at(180)).toBe(Date.parse('2026-10-25T02:00:00Z'));
	});
});

describe('properties', () => {
	const ZONES = [
		'Europe/Berlin',
		'America/St_Johns',
		'Asia/Kathmandu',
		'Australia/Lord_Howe',
		'Pacific/Kiritimati',
		'Pacific/Pago_Pago'
	];
	const zone = fc.constantFrom(...ZONES);
	const dateKey = fc
		.date({
			min: new Date('2024-01-01T00:00:00Z'),
			max: new Date('2030-12-31T00:00:00Z'),
			noInvalidDate: true
		})
		.map((date) => date.toISOString().slice(0, 10));
	const minute = fc.integer({ min: 0, max: 1439 });

	/** The UTC offset in minutes at an instant, read independently of the code under test. */
	function offsetAt(at: number, timezone: string) {
		const name = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			timeZoneName: 'longOffset'
		})
			.formatToParts(new Date(at))
			.find((part) => part.type === 'timeZoneName')!.value;
		const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
		return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
	}

	/** True when the offset does not change within a day and a half around the date, so no gap is in play. */
	function steady(date: string, timezone: string) {
		const midnight = Date.parse(date + 'T00:00:00Z');
		return (
			offsetAt(midnight - 36 * 3_600_000, timezone) ===
			offsetAt(midnight + 60 * 3_600_000, timezone)
		);
	}

	test('a wall time outside a daylight saving change reads back as the same minute and day', () => {
		fc.assert(
			fc.property(dateKey, minute, zone, (date, minutes, timezone) => {
				fc.pre(steady(date, timezone));
				const at = zonedToEpoch(date, minutes, timezone);
				expect(minutesOf(at, timezone)).toBe(minutes);
				expect(todayIn(timezone, new Date(at))).toBe(date);
			})
		);
	});

	test('around a daylight saving change the result is never more than an hour from the wall time', () => {
		fc.assert(
			fc.property(dateKey, minute, zone, (date, minutes, timezone) => {
				const at = zonedToEpoch(date, minutes, timezone);
				const wall = Date.parse(date + 'T00:00:00Z') + minutes * 60_000;
				const shown =
					Date.parse(todayIn(timezone, new Date(at)) + 'T00:00:00Z') +
					minutesOf(at, timezone) * 60_000;
				expect(Math.abs(shown - wall)).toBeLessThanOrEqual(60 * 60_000);
			})
		);
	});

	test('addDays and its inverse give back the date', () => {
		fc.assert(
			fc.property(dateKey, fc.integer({ min: -4000, max: 4000 }), (date, days) => {
				expect(addDays(addDays(date, days), -days)).toBe(date);
				expect(isDateKey(addDays(date, days))).toBe(true);
			})
		);
	});
});

describe('localMoment', () => {
	test('gives the day and the minutes the instant has on the wall of the timezone', () => {
		const at = Date.parse('2026-10-14T23:30:00Z');
		expect(localMoment(at, 'UTC')).toEqual({ date: '2026-10-14', minutes: 1410 });
		expect(localMoment(at, 'Asia/Tokyo')).toEqual({ date: '2026-10-15', minutes: 510 });
		expect(localMoment(at, 'America/St_Johns')).toEqual({ date: '2026-10-14', minutes: 1260 });
	});

	test('undoes zonedToEpoch', () => {
		const at = zonedToEpoch('2026-03-29', 600, 'Europe/Berlin');
		expect(localMoment(at, 'Europe/Berlin')).toEqual({ date: '2026-03-29', minutes: 600 });
	});

	test('an invalid timezone is read as UTC', () => {
		expect(localMoment(Date.parse('2026-10-14T10:00:00Z'), 'Not/AZone')).toEqual({
			date: '2026-10-14',
			minutes: 600
		});
	});
});

describe('clockParts in 12 hour format', () => {
	test('has no leading zero and names AM or PM', () => {
		const at = new Date('2026-10-14T23:05:09Z');
		expect(clockParts('UTC', at, true)).toEqual({ time: '11:05', seconds: '09', period: 'PM' });
		expect(clockParts('Asia/Tokyo', at, true)).toEqual({
			time: '8:05',
			seconds: '09',
			period: 'AM'
		});
	});

	test('midnight is 12:00 AM', () => {
		expect(clockParts('UTC', new Date('2026-10-14T00:00:00Z'), true).time).toBe('12:00');
	});
});
