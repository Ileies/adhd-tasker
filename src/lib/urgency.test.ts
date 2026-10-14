import { describe, expect, test } from 'bun:test';
import { Priority } from '#lib/types.js';
import { urgencyLevel } from '#lib/urgency.js';
import { formatClock, formatCountdown, formatDuration } from '#lib/format.js';

describe('urgencyLevel', () => {
	test('follows priority while there is plenty of time', () => {
		expect(urgencyLevel(Priority.Low, 50, 60)).toBe(0);
		expect(urgencyLevel(Priority.Medium, 50, 60)).toBe(1);
		expect(urgencyLevel(Priority.High, 50, 60)).toBe(2);
		expect(urgencyLevel(Priority.Critical, 50, 60)).toBe(3);
	});

	test('running low on time raises calm tasks to pressing', () => {
		expect(urgencyLevel(Priority.Low, 10, 60)).toBe(2);
		expect(urgencyLevel(Priority.Critical, 10, 60)).toBe(3);
	});

	test('overrunning is always critical', () => {
		expect(urgencyLevel(Priority.Low, -1, 60)).toBe(3);
	});
});

describe('format', () => {
	test('formatClock', () => {
		expect(formatClock(570)).toBe('09:30');
		expect(formatClock(0)).toBe('00:00');
	});
	test('formatDuration', () => {
		expect(formatDuration(45)).toBe('45m');
		expect(formatDuration(120)).toBe('2h');
		expect(formatDuration(90)).toBe('1h 30m');
	});
	test('formatCountdown', () => {
		expect(formatCountdown(65)).toBe('1:05');
	});
});
