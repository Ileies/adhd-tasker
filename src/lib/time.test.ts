/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { addDays, formatDay, isDateKey, todayIn } from '#lib/time.js';

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
