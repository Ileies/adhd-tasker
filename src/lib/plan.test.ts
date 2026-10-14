/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { TaskStatus } from '#lib/types.js';
import {
	DAY_MINUTES,
	MIN_DURATION,
	SNAP,
	conflictsWith,
	layoutDay,
	moveTo,
	resizeTo,
	snap
} from '#lib/plan.js';

const span = (id: number, startTime: number, duration: number, status = TaskStatus.Pending) => ({
	id,
	startTime,
	duration,
	status
});

describe('grid', () => {
	test('snaps to 15 minutes', () => {
		expect(snap(7)).toBe(0);
		expect(snap(8)).toBe(15);
		expect(snap(547)).toBe(540);
	});

	test('a moved task stays inside the day', () => {
		expect(moveTo(-40, 60)).toBe(0);
		expect(moveTo(1430, 60)).toBe(1380);
		expect(moveTo(601, 60)).toBe(600);
	});

	test('a resized task keeps a minimum and ends by midnight', () => {
		expect(resizeTo(600, 3)).toBe(15);
		expect(resizeTo(1400, 120)).toBe(40);
		expect(resizeTo(600, 50)).toBe(45);
	});
});

describe('layoutDay', () => {
	test('separate tasks use the full width', () => {
		const result = layoutDay([span(1, 540, 60), span(2, 600, 60)]);
		expect(result.every((p) => p.lanes === 1 && !p.overlaps)).toBe(true);
	});

	test('overlapping tasks get their own lanes and are flagged', () => {
		const result = layoutDay([span(1, 540, 120), span(2, 570, 30)]);
		expect(result.map((p) => [p.task.id, p.lane, p.lanes, p.overlaps])).toEqual([
			[1, 0, 2, true],
			[2, 1, 2, true]
		]);
	});

	test('a lane is reused once its task ended, within the same group', () => {
		const result = layoutDay([span(1, 540, 120), span(2, 540, 30), span(3, 580, 30)]);
		const lane = (id: number) => result.find((p) => p.task.id === id)?.lane;
		expect(lane(1)).toBe(0);
		expect(lane(2)).toBe(1);
		expect(lane(3)).toBe(1);
	});

	test('touching tasks do not overlap', () => {
		const result = layoutDay([span(1, 540, 60), span(2, 600, 60)]);
		expect(result.some((p) => p.overlaps)).toBe(false);
	});
});

describe('conflictsWith', () => {
	test('ignores itself and completed tasks', () => {
		const tasks = [span(1, 540, 60), span(2, 560, 30, TaskStatus.Completed), span(3, 570, 30)];
		expect(conflictsWith(tasks[0], tasks).map((t) => t.id)).toEqual([3]);
	});
});

describe('properties', () => {
	const gridStart = fc.integer({ min: 0, max: 95 }).map((step) => step * SNAP);
	const gridDuration = fc.integer({ min: 1, max: 96 }).map((step) => step * SNAP);
	const anyMinutes = fc.integer({ min: -2000, max: 4000 });

	test('snap lands on the grid, within half a step, and is idempotent', () => {
		fc.assert(
			fc.property(anyMinutes, (minutes) => {
				const snapped = snap(minutes);
				// Small negative minutes snap to -0, which is a multiple of the step too
				expect(Math.abs(snapped % SNAP)).toBe(0);
				expect(Math.abs(snapped - minutes)).toBeLessThanOrEqual(SNAP / 2);
				expect(snap(snapped)).toBe(snapped);
			})
		);
	});

	test('a moved task stays inside the day, and on the grid when its length is', () => {
		fc.assert(
			fc.property(anyMinutes, gridDuration, (start, duration) => {
				const moved = moveTo(start, duration);
				expect(moved).toBeGreaterThanOrEqual(0);
				expect(moved + duration).toBeLessThanOrEqual(DAY_MINUTES);
				expect(moved % SNAP).toBe(0);
			})
		);
	});

	test('a moved task of any length stays inside the day', () => {
		fc.assert(
			fc.property(anyMinutes, fc.integer({ min: 5, max: DAY_MINUTES }), (start, duration) => {
				const moved = moveTo(start, duration);
				expect(moved).toBeGreaterThanOrEqual(0);
				expect(moved + duration).toBeLessThanOrEqual(DAY_MINUTES);
			})
		);
	});

	test('a resized task ends by midnight, on the grid, and is at least one step long', () => {
		fc.assert(
			fc.property(gridStart, anyMinutes, (start, wanted) => {
				const duration = resizeTo(start, wanted);
				expect(start + duration).toBeLessThanOrEqual(DAY_MINUTES);
				expect(duration % SNAP).toBe(0);
				expect(duration).toBeGreaterThanOrEqual(MIN_DURATION);
			})
		);
	});
});
