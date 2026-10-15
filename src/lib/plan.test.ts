/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { Priority, TaskStatus } from '#lib/types.js';
import {
	DAY_MINUTES,
	MIN_DURATION,
	SNAP,
	conflictsWith,
	extendTask,
	keyAdjust,
	layoutDay,
	moveLater,
	moveTo,
	nextFreeSlot,
	overlapLine,
	phoneGroups,
	resizeTo,
	snap,
	visibleRange
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

describe('extendTask', () => {
	test('a missed task gets the minutes from now', () => {
		expect(extendTask({ startTime: 600, duration: 30 }, 660, 15)).toBe(75);
	});

	test('a running task keeps its end and gets the minutes on top', () => {
		expect(extendTask({ startTime: 600, duration: 60 }, 630, 15)).toBe(75);
	});

	test('never crosses midnight (D5)', () => {
		expect(extendTask({ startTime: 1400, duration: 30 }, 1435, 15)).toBe(40);
	});

	test('a task that already ends at midnight cannot grow', () => {
		expect(extendTask({ startTime: 1380, duration: 60 }, 1430, 15)).toBe(60);
	});

	test('after 23:45 the extension is cut, not wrapped (D5)', () => {
		expect(extendTask({ startTime: 1420, duration: 10 }, 1439, 15)).toBe(20);
	});

	test('property: the new end is at most midnight and never before the old end', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 1435 }),
				fc.integer({ min: 5, max: 600 }),
				fc.integer({ min: 0, max: 1439 }),
				fc.integer({ min: 1, max: 120 }),
				(startTime, length, now, minutes) => {
					const duration = Math.min(length, DAY_MINUTES - startTime);
					const next = extendTask({ startTime, duration }, now, minutes);
					expect(startTime + next).toBeLessThanOrEqual(DAY_MINUTES);
					expect(next).toBeGreaterThanOrEqual(duration);
					expect(Number.isInteger(next)).toBe(true);
				}
			)
		);
	});
});

describe('nextFreeSlot', () => {
	const h = (hours: number, minutes = 0) => hours * 60 + minutes;

	test('an empty day gives the next grid step after now', () => {
		expect(nextFreeSlot([], h(10, 3), 30)).toBe(h(10, 15));
		expect(nextFreeSlot([], h(10, 15), 30)).toBe(h(10, 15));
	});

	test('skips past a task that is in the way, onto the grid', () => {
		const others = [span(1, h(10, 15), 40)];
		expect(nextFreeSlot(others, h(10, 3), 30)).toBe(h(11));
	});

	test('uses a gap that fits and skips one that is too small', () => {
		const others = [span(1, h(10), 60), span(2, h(11, 15), 60), span(3, h(12, 30), 60)];
		expect(nextFreeSlot(others, h(10), 15)).toBe(h(11));
		expect(nextFreeSlot(others, h(10), 30)).toBe(h(13, 30));
	});

	test('a gap that fits exactly is used', () => {
		const others = [span(1, h(10), 60), span(2, h(11, 30), 60)];
		expect(nextFreeSlot(others, h(10), 30)).toBe(h(11));
	});

	test('completed tasks do not block', () => {
		const others = [span(1, h(10), 120, TaskStatus.Completed)];
		expect(nextFreeSlot(others, h(10), 60)).toBe(h(10));
	});

	test('null when nothing fits before midnight', () => {
		expect(nextFreeSlot([span(1, h(9), 900)], h(9), 60)).toBeNull();
		expect(nextFreeSlot([], h(23, 50), 30)).toBeNull();
	});

	test('a task may end exactly at midnight', () => {
		expect(nextFreeSlot([], h(23), 60)).toBe(h(23));
	});

	test('the slot is on the grid, after now, free and inside the day', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						start: fc.integer({ min: 0, max: 1400 }),
						duration: fc.integer({ min: 15, max: 240 })
					}),
					{ maxLength: 8 }
				),
				fc.integer({ min: 0, max: 1439 }),
				fc.integer({ min: 15, max: 240 }),
				(spans, now, duration) => {
					const others = spans.map((s, i) =>
						span(i + 1, s.start, Math.min(s.duration, DAY_MINUTES - s.start))
					);
					const slot = nextFreeSlot(others, now, duration);
					if (slot === null) return;
					expect(slot % SNAP).toBe(0);
					expect(slot).toBeGreaterThanOrEqual(now);
					expect(slot + duration).toBeLessThanOrEqual(DAY_MINUTES);
					expect(conflictsWith(span(0, slot, duration), others)).toEqual([]);
				}
			)
		);
	});
});

describe('moveLater', () => {
	const h = (hours: number, minutes = 0) => hours * 60 + minutes;
	const missed = { startTime: h(9), duration: 60 };

	test('takes the next free slot today', () => {
		const others = [span(2, h(10), 60)];
		expect(moveLater(missed, others, '2026-10-14', h(10, 5))).toEqual({
			date: '2026-10-14',
			startTime: h(11),
			tomorrow: false
		});
	});

	test('keeps the start time on the next day when nothing fits today', () => {
		const others = [span(2, h(10), 840)];
		expect(moveLater(missed, others, '2026-10-31', h(10, 5))).toEqual({
			date: '2026-11-01',
			startTime: h(9),
			tomorrow: true
		});
	});
});

describe('visibleRange', () => {
	const h = (hours: number) => hours * 60;

	test('is the day itself when every task is inside it', () => {
		expect(visibleRange([span(1, h(9), 60)])).toEqual({ start: h(7), end: h(23) });
	});

	test('widens to whole hours around a task outside the day', () => {
		expect(visibleRange([span(1, h(5) + 30, 60), span(2, h(23) + 15, 30)])).toEqual({
			start: h(5),
			end: h(24)
		});
	});
});

describe('keyAdjust', () => {
	const task = { startTime: 600, duration: 60 };

	test.each([
		['ArrowUp', false, { startTime: 585 }],
		['ArrowDown', false, { startTime: 615 }],
		['ArrowUp', true, { duration: 45 }],
		['ArrowDown', true, { duration: 75 }],
		['ArrowLeft', false, null]
	])('%s with shift %s', (key, shift, expected) => {
		expect(keyAdjust(task, key, shift)).toEqual(expected);
	});

	test('stays inside the day and above the minimum', () => {
		expect(keyAdjust({ startTime: 0, duration: 60 }, 'ArrowUp', false)).toEqual({ startTime: 0 });
		expect(keyAdjust({ startTime: 600, duration: MIN_DURATION }, 'ArrowUp', true)).toEqual({
			duration: MIN_DURATION
		});
	});
});

describe('overlapLine', () => {
	const named = (
		id: number,
		title: string,
		startTime: number,
		duration: number,
		priority = Priority.Medium,
		status = TaskStatus.Pending
	) => ({ id, title, startTime, duration, priority, status });

	test('is null without an overlap', () => {
		expect(overlapLine([named(1, 'A', 600, 60), named(2, 'B', 660, 60)])).toBeNull();
	});

	test('names both tasks and the higher priority winner', () => {
		const line = overlapLine([
			named(1, 'Study', 1020, 120),
			named(2, 'Dinner', 1080, 60, Priority.High)
		]);
		expect(line).toBe('Study and Dinner overlap at 18:00. Now shows Dinner (higher priority).');
	});

	test('with equal priority the one that starts first wins', () => {
		expect(overlapLine([named(1, 'A', 600, 60), named(2, 'B', 630, 60)])).toContain(
			'Now shows A (it starts first)'
		);
	});

	test('a done task does not overlap', () => {
		const done = named(2, 'B', 630, 60, Priority.Medium, TaskStatus.Completed);
		expect(overlapLine([named(1, 'A', 600, 60), done])).toBeNull();
	});

	test('counts the other overlaps', () => {
		const line = overlapLine([
			named(1, 'A', 600, 60),
			named(2, 'B', 630, 60),
			named(3, 'C', 900, 60),
			named(4, 'D', 930, 60)
		]);
		expect(line).toEndWith('1 more overlap.');
	});
});

describe('phoneGroups', () => {
	const day = [
		span(1, 480, 60, TaskStatus.Completed),
		span(2, 540, 30),
		span(3, 600, 60),
		span(4, 720, 60)
	];

	test('splits today around now', () => {
		const groups = phoneGroups(day, 610);
		expect(groups.done.map((t) => t.id)).toEqual([1]);
		expect(groups.missed.map((t) => t.id)).toEqual([2]);
		expect(groups.current.map((t) => t.id)).toEqual([3]);
		expect(groups.later.map((t) => t.id)).toEqual([4]);
	});

	test('another day is one plain list by start time', () => {
		const groups = phoneGroups([...day].reverse(), null);
		expect(groups.later.map((t) => t.id)).toEqual([1, 2, 3, 4]);
		expect(groups.done).toEqual([]);
	});
});
