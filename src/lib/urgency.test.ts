/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { Priority } from '#lib/types.js';
import { priorityStyle, urgencyLevel } from '#lib/urgency.js';
import { formatClock, formatDuration } from '#lib/format.js';

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

describe('priorityStyle', () => {
	test('chip and block of a priority use the same urgency color', () => {
		for (const style of Object.values(priorityStyle)) {
			const level = /bg-urgency-(\d)/.exec(style.block)?.[1];
			expect(level).toBeDefined();
			expect(style.chip).toContain(`bg-urgency-${level}/20`);
		}
	});

	test('priorities with the same urgency differ by label and bars', () => {
		expect(priorityStyle[Priority.High].block).toBe(priorityStyle[Priority.Urgent].block);
		expect(priorityStyle[Priority.High].bars).not.toBe(priorityStyle[Priority.Urgent].bars);
	});

	test('the ramp follows urgencyLevel', () => {
		for (const [priority, style] of Object.entries(priorityStyle)) {
			const level = urgencyLevel(Number(priority) as Priority, 50, 60);
			expect(style.block).toContain(`bg-urgency-${level} `);
		}
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
});
