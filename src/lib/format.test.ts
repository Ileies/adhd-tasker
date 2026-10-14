/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	formatClock,
	formatCountdown,
	formatDuration,
	formatLeft,
	formatMinutes
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

describe('formatCountdown', () => {
	test.each([
		[28, '0:28'],
		[5, '0:05'],
		[80, '1:20']
	])('%d minutes is %s', (minutes, text) => {
		expect(formatCountdown(minutes)).toBe(text);
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
