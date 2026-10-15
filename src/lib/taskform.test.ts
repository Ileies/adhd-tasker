/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { type DateChoice, dateChoice, endLine, isChipDuration, parseClock } from '#lib/taskform.js';

describe('dateChoice', () => {
	test.each<[string, DateChoice]>([
		['2026-10-15', 'today'],
		['2026-10-16', 'tomorrow'],
		['2026-10-17', 'other'],
		['2026-10-14', 'other']
	])('%s is %s when today is 2026-10-15', (date, expected) => {
		expect(dateChoice(date, '2026-10-15')).toBe(expected);
	});

	test('tomorrow follows the month end', () => {
		expect(dateChoice('2026-11-01', '2026-10-31')).toBe('tomorrow');
	});
});

describe('endLine', () => {
	test('names the end time', () => {
		expect(endLine(840, 30)).toEqual({ text: 'Ends 14:30', over: false });
	});

	test('a task ending exactly at midnight is fine', () => {
		expect(endLine(1410, 30)).toEqual({ text: 'Ends 24:00', over: false });
	});

	test('a task past midnight is flagged', () => {
		expect(endLine(1410, 45).over).toBe(true);
	});
});

describe('parseClock', () => {
	test.each([
		['14:05', 845],
		['0:00', 0],
		['23:59', 1439]
	])('%s is %d minutes', (value, expected) => {
		expect(parseClock(value)).toBe(expected);
	});

	test.each(['', '24:00', '12:60', 'abc', '1405'])('"%s" is not a time', (value) => {
		expect(parseClock(value)).toBeNull();
	});
});

describe('isChipDuration', () => {
	test('chips are 15, 30, 45, 60 and 120', () => {
		expect([15, 30, 45, 60, 120].every(isChipDuration)).toBe(true);
	});

	test('other values need the free field', () => {
		expect(isChipDuration(50)).toBe(false);
	});
});
