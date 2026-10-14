/// <reference types="bun" />
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import {
	addDays,
	formatDay,
	isDateKey,
	isValidTimezone,
	minutesNow,
	todayIn,
	zonedToEpoch
} from '#lib/time.js';

afterEach(() => setSystemTime());

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
