/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { Priority, TaskStatus } from '#lib/types.js';
import { minutesLeft, rank, switchReason, type RankTask } from '#lib/priority.js';

let nextId = 1;
const task = (
	title: string,
	startTime: number,
	duration: number,
	priority = Priority.Medium,
	status = TaskStatus.Pending
): RankTask => ({
	id: nextId++,
	title,
	startTime,
	duration,
	priority,
	status
});

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

describe('rank', () => {
	test('picks the task whose window contains now', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(10), 60);
		expect(rank([a, b], h(9, 30)).current).toBe(a);
		expect(rank([a, b], h(10)).current).toBe(b);
	});

	test('window is start inclusive and end exclusive', () => {
		const a = task('A', h(9), 60);
		expect(rank([a], h(9)).current).toBe(a);
		expect(rank([a], h(10)).current).toBeNull();
	});

	test('highest priority wins among overlapping tasks', () => {
		const low = task('Low', h(9), 120, Priority.Low);
		const high = task('High', h(9, 30), 30, Priority.High);
		const ranking = rank([low, high], h(9, 45));
		expect(ranking.current).toBe(high);
		expect(ranking.concurrent).toBe(2);
	});

	test('ties go to the earlier start, then the shorter task', () => {
		const late = task('Late', h(9, 30), 60);
		const early = task('Early', h(9), 120);
		expect(rank([late, early], h(10)).current).toBe(early);

		const long = task('Long', h(9), 120);
		const short = task('Short', h(9), 30);
		expect(rank([long, short], h(9, 10)).current).toBe(short);
	});

	test('a preempted task returns when the higher priority one is done', () => {
		const base = task('Base', h(9), 120, Priority.Low);
		const urgent = task('Urgent', h(10), 30, Priority.Critical);
		expect(rank([base, urgent], h(10, 15)).current).toBe(urgent);
		urgent.status = TaskStatus.Completed;
		expect(rank([base, urgent], h(10, 15)).current).toBe(base);
	});

	test('upcoming is sorted by start and excludes completed tasks', () => {
		const a = task('A', h(11), 30);
		const b = task('B', h(10), 30);
		const done = task('Done', h(12), 30, Priority.Medium, TaskStatus.Completed);
		expect(rank([a, b, done], h(9)).upcoming).toEqual([b, a]);
	});

	test('a task whose window ended is missed, never current', () => {
		const a = task('A', h(9), 30);
		const ranking = rank([a], h(10));
		expect(ranking.current).toBeNull();
		expect(ranking.missed).toEqual([a]);
	});

	test('missed lists the most recently ended first', () => {
		const a = task('A', h(8), 30);
		const b = task('B', h(9), 30);
		expect(rank([a, b], h(12)).missed).toEqual([b, a]);
	});

	test('stored active and overdue statuses are ignored', () => {
		const a = task('A', h(9), 60, Priority.Medium, TaskStatus.Active);
		const b = task('B', h(7), 30, Priority.Medium, TaskStatus.Overdue);
		const ranking = rank([a, b], h(9, 10));
		expect(ranking.current).toBe(a);
		expect(ranking.missed).toEqual([b]);
	});

	test('empty plan', () => {
		expect(rank([], h(9))).toEqual({ current: null, upcoming: [], missed: [], concurrent: 0 });
	});
});

describe('minutesLeft', () => {
	test('counts down to the end of the window', () => {
		expect(minutesLeft(task('A', h(9), 60), h(9, 45))).toBe(15);
		expect(minutesLeft(task('A', h(9), 60), h(10, 5))).toBe(-5);
	});
});

describe('switchReason', () => {
	test('null while the current task is unchanged', () => {
		const a = task('A', h(9), 60);
		const tasks = [a];
		expect(switchReason(a, rank(tasks, h(9, 10)), tasks, h(9, 10))).toBeNull();
		expect(switchReason(null, rank([], h(9)), [], h(9))).toBeNull();
	});

	test('first load', () => {
		const a = task('A', h(9), 60);
		expect(switchReason(null, rank([a], h(9, 10)), [a], h(9, 10))).toBe('Scheduled for now');
		const b = task('B', h(9), 60, Priority.High);
		expect(switchReason(null, rank([a, b], h(9, 10)), [a, b], h(9, 10))).toBe(
			'Highest priority of 2 tasks right now'
		);
	});

	test('previous task done', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(9), 60, Priority.Low);
		a.status = TaskStatus.Completed;
		expect(
			switchReason({ ...a, status: TaskStatus.Pending }, rank([a, b], h(9, 10)), [a, b], h(9, 10))
		).toBe('Previous task done');
	});

	test('higher priority task started', () => {
		const a = task('A', h(9), 120, Priority.Low);
		const b = task('B', h(10), 30, Priority.Critical);
		expect(switchReason(a, rank([a, b], h(10)), [a, b], h(10))).toBe(
			'Critical priority task started'
		);
	});

	test('time ran out', () => {
		const a = task('A', h(9), 30);
		const b = task('B', h(9, 30), 30);
		expect(switchReason(a, rank([a, b], h(9, 30)), [a, b], h(9, 30))).toBe(
			'Time for the previous task ended'
		);
	});

	test('nothing else is due', () => {
		const a = task('A', h(9), 30);
		expect(switchReason(a, rank([a], h(10)), [a], h(10))).toBe(
			'Time for the previous task ended. Nothing else is due right now'
		);
	});

	test('previous task deleted', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(9), 60, Priority.Low);
		expect(switchReason(a, rank([b], h(9, 10)), [b], h(9, 10))).toBe('Previous task removed');
	});
});

describe('properties', () => {
	const tasks = fc
		.array(
			fc.record({
				startTime: fc.integer({ min: 0, max: 1435 }),
				length: fc.integer({ min: 5, max: 1440 }),
				priority: fc.integer({ min: 1, max: 5 }),
				done: fc.boolean()
			}),
			{ maxLength: 12 }
		)
		.map((specs) =>
			specs.map(
				(spec, index): RankTask => ({
					id: index + 1,
					title: `Task ${index + 1}`,
					startTime: spec.startTime,
					duration: Math.min(spec.length, 1440 - spec.startTime),
					priority: spec.priority as Priority,
					status: spec.done ? TaskStatus.Completed : TaskStatus.Pending
				})
			)
		);
	const now = fc.integer({ min: 0, max: 1439 });
	const runs = (task: RankTask, at: number) =>
		task.startTime <= at && at < task.startTime + task.duration;

	test('the current task is open and contains now, or there is none', () => {
		fc.assert(
			fc.property(tasks, now, (list, at) => {
				const { current } = rank(list, at);
				if (current) {
					expect(runs(current, at)).toBe(true);
					expect(current.status).not.toBe(TaskStatus.Completed);
				} else {
					expect(list.some((task) => task.status !== TaskStatus.Completed && runs(task, at))).toBe(
						false
					);
				}
			})
		);
	});

	test('no open task running now has a higher priority than the current one', () => {
		fc.assert(
			fc.property(tasks, now, (list, at) => {
				const { current } = rank(list, at);
				if (!current) return;
				for (const task of list)
					if (task.status !== TaskStatus.Completed && runs(task, at))
						expect(task.priority).toBeLessThanOrEqual(current.priority);
			})
		);
	});

	test('every open task is exactly one of running, upcoming or missed', () => {
		fc.assert(
			fc.property(tasks, now, (list, at) => {
				const { upcoming, missed, concurrent } = rank(list, at);
				const open = list.filter((task) => task.status !== TaskStatus.Completed);
				expect(concurrent + upcoming.length + missed.length).toBe(open.length);
				expect(concurrent).toBe(open.filter((task) => runs(task, at)).length);
			})
		);
	});

	test('the result does not depend on the order of the input', () => {
		fc.assert(
			fc.property(tasks, now, (list, at) => {
				const ids = (items: RankTask[]) => items.map((task) => task.id);
				const forward = rank(list, at);
				const backward = rank([...list].reverse(), at);
				expect(backward.current?.id).toBe(forward.current?.id);
				expect(ids(backward.upcoming)).toEqual(ids(forward.upcoming));
				expect(ids(backward.missed)).toEqual(ids(forward.missed));
			})
		);
	});
});
