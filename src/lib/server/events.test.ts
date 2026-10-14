/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { startOfDayMs } from '#lib/server/events.js';

describe('startOfDayMs', () => {
	test('goes back by the minutes into the day', () => {
		const now = Date.parse('2026-10-14T10:30:00Z');
		expect(startOfDayMs(630, now)).toBe(Date.parse('2026-10-14T00:00:00Z'));
	});

	test('drops the seconds of the current minute', () => {
		const now = Date.parse('2026-10-14T10:30:45.500Z');
		expect(startOfDayMs(630, now)).toBe(Date.parse('2026-10-14T00:00:00Z'));
	});

	test('at midnight the day starts now', () => {
		const now = Date.parse('2026-10-14T00:00:00Z');
		expect(startOfDayMs(0, now)).toBe(now);
	});
});
