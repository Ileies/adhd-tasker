/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	formatClock,
	formatClock12,
	deviceClock12h,
	effectiveClock12h,
	formatClock24,
	formatDuration,
	formatLeft,
	formatMinutes,
	setClockHour12
} from '#lib/format.js';

describe('formatClock', () => {
	test.each([
		[0, '00:00'],
		[5, '00:05'],
		[75, '01:15'],
		[1439, '23:59']
	])('%d minutes is %s', (minutes, text) => {
		expect(formatClock(minutes)).toBe(text);
	});
});

describe('formatDuration', () => {
	test.each([
		[45, '45m'],
		[120, '2h'],
		[90, '1h 30m'],
		[0, '0m']
	])('%d minutes is %s', (minutes, text) => {
		expect(formatDuration(minutes)).toBe(text);
	});
});

describe('formatMinutes', () => {
	test.each([
		[28, '28 min'],
		[60, '1 h'],
		[80, '1 h 20 min'],
		[125, '2 h 5 min'],
		[0, '0 min'],
		[-4, '0 min'],
		[28.9, '28 min']
	])('%d minutes is %s', (minutes, text) => {
		expect(formatMinutes(minutes)).toBe(text);
	});
});

describe('formatLeft', () => {
	test.each([
		[28, '28 min left'],
		[80, '1 h 20 min left'],
		[1, '1 min left'],
		[0.5, 'Less than 1 min left'],
		[0, 'Less than 1 min left']
	])('%d minutes left reads %s', (minutes, text) => {
		expect(formatLeft(minutes)).toBe(text);
	});

	test('the end time follows when it is given', () => {
		expect(formatLeft(28, 15 * 60)).toBe('28 min left, until 15:00');
		expect(formatLeft(80, 15 * 60 + 5)).toBe('1 h 20 min left, until 15:05');
	});

	test('an end time of midnight still shows', () => {
		expect(formatLeft(10, 0)).toBe('10 min left, until 00:00');
	});
});

describe('formatClock12 and formatClock24', () => {
	test.each([
		[0, '12:00 AM'],
		[5, '12:05 AM'],
		[720, '12:00 PM'],
		[905, '3:05 PM'],
		[1439, '11:59 PM'],
		[1440, '12:00 AM']
	])('%d minutes is %s in 12 hour format', (minutes, text) => {
		expect(formatClock12(minutes)).toBe(text);
	});

	test('formatClock follows the chosen format and formatClock24 never does', () => {
		setClockHour12(true);
		try {
			expect(formatClock(905)).toBe('3:05 PM');
			expect(formatClock24(905)).toBe('15:05');
		} finally {
			setClockHour12(false);
		}
		expect(formatClock(905)).toBe('15:05');
	});
});

describe('effectiveClock12h', () => {
	test('a saved choice wins, either way', () => {
		expect(effectiveClock12h(true)).toBe(true);
		expect(effectiveClock12h(false)).toBe(false);
	});

	test('without a choice and without a browser it is 24 hour', () => {
		expect(effectiveClock12h(null)).toBe(false);
		expect(deviceClock12h()).toBe(false);
	});
});
