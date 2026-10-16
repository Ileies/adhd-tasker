/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	HORIZON_DAYS,
	REALISTIC_SHARE,
	capacityOf,
	fitWords,
	fittings,
	freeBetween,
	overbookedLine,
	shortDate,
	type CapacityInput,
	type CapacityTask
} from '#lib/capacity.js';
import type { PickTodo } from '#lib/pick.js';
import { Priority, TaskStatus } from '#lib/types.js';

const TODAY = '2026-10-14';
const START = 7 * 60;
const END = 23 * 60;
/** A whole My day, 16 h. */
const DAY = END - START;

const task = (
	date: string,
	startTime: number,
	duration: number,
	patch: Partial<CapacityTask> = {}
) =>
	({
		id: Math.round(Math.random() * 1e9),
		title: 'Meeting',
		date,
		startTime,
		duration,
		priority: Priority.Medium,
		status: TaskStatus.Pending,
		kind: 'appointment',
		...patch
	}) as CapacityTask;

const plan = (patch: Partial<CapacityInput> = {}) =>
	capacityOf({ tasks: [], today: TODAY, now: START, myDayStart: START, myDayEnd: END, ...patch });

const todo = (id: number, patch: Partial<PickTodo> = {}): PickTodo => ({
	id,
	title: `Exam ${id}`,
	priority: Priority.Medium,
	estimate: 600,
	progress: 0,
	dueDate: '2026-11-04',
	dueTime: null,
	notBefore: null,
	status: 'open',
	...patch
});

describe('freeBetween', () => {
	test('a task takes its minutes off, overlapping tasks count once', () => {
		const tasks = [
			{ startTime: 600, duration: 60, status: TaskStatus.Pending },
			{ startTime: 630, duration: 60, status: TaskStatus.Pending }
		];
		expect(freeBetween(tasks, 540, 780)).toBe(240 - 90);
	});

	test('a done task holds nothing', () => {
		expect(
			freeBetween([{ startTime: 600, duration: 60, status: TaskStatus.Completed }], 540, 780)
		).toBe(240);
	});

	test('nothing is free after the end', () => {
		expect(freeBetween([], 600, 600)).toBe(0);
		expect(freeBetween([], 600, 500)).toBe(0);
	});
});

describe('capacityOf', () => {
	test('a whole free day gives the realistic share of My day', () => {
		expect(plan().until(TODAY)).toBe(Math.round(DAY * REALISTIC_SHARE));
	});

	test('the share is 60 percent', () => {
		expect(REALISTIC_SHARE).toBe(0.6);
	});

	test('today counts from now, not from the start of the day', () => {
		expect(plan({ now: 15 * 60 }).until(TODAY)).toBe(Math.round(8 * 60 * REALISTIC_SHARE));
	});

	test('before My day starts the day counts from its start', () => {
		expect(plan({ now: 5 * 60 }).until(TODAY)).toBe(Math.round(DAY * REALISTIC_SHARE));
	});

	test('after My day ended nothing is left today', () => {
		expect(plan({ now: 23 * 60 + 30 }).until(TODAY)).toBe(0);
	});

	test('every day until the date adds its own free time', () => {
		expect(plan().until('2026-10-16')).toBe(Math.round(3 * DAY * REALISTIC_SHARE));
	});

	test('an appointment takes its hours off the day it is on', () => {
		const tasks = [task('2026-10-15', 12 * 60, 120)];
		expect(plan({ tasks }).until('2026-10-15')).toBe(Math.round((2 * DAY - 120) * REALISTIC_SHARE));
	});

	test('a task that may move still takes its hours, the day is the same size', () => {
		const tasks = [
			task('2026-10-14', 12 * 60, 60),
			task('2026-10-14', 12 * 60, 60, { kind: 'block', shift: 60 })
		];
		expect(plan({ tasks }).until(TODAY)).toBe(Math.round((DAY - 120) * REALISTIC_SHARE));
	});

	test('a done task of a later day gives its hours back', () => {
		const tasks = [task('2026-10-15', 12 * 60, 120, { status: TaskStatus.Completed })];
		expect(plan({ tasks }).until('2026-10-15')).toBe(Math.round(2 * DAY * REALISTIC_SHARE));
	});

	test('a time on the last day cuts it short', () => {
		expect(plan().until('2026-10-15', 12 * 60)).toBe(Math.round((DAY + 5 * 60) * REALISTIC_SHARE));
	});

	test('a time after the end of My day is cut at it', () => {
		expect(plan().until(TODAY, 1400)).toBe(plan().until(TODAY));
	});

	test('a date in the past counts as today', () => {
		expect(plan().until('2026-10-01')).toBe(plan().until(TODAY));
	});

	test('tasks of past days are ignored', () => {
		const tasks = [task('2026-10-13', 600, 600)];
		expect(plan({ tasks }).until(TODAY)).toBe(plan().until(TODAY));
	});

	test('a date far away is counted as the horizon', () => {
		const far = plan().until('2126-10-14');
		expect(far).toBe(plan().until('2030-10-14'));
		expect(far).toBeGreaterThanOrEqual(Math.round(HORIZON_DAYS * DAY * REALISTIC_SHARE));
	});

	test('a day month boundary and a leap year are plain days', () => {
		expect(plan({ today: '2028-02-28' }).until('2028-03-01')).toBe(
			Math.round(3 * DAY * REALISTIC_SHARE)
		);
	});
});

describe('fittings', () => {
	test('a to-do that needs a fifth of the free time is on track', () => {
		const result = fittings([todo(1, { estimate: 600 })], plan(), TODAY, END);
		expect(result.get(1)?.fit).toBe('on-track');
	});

	test('a to-do that needs most of the free time is tight', () => {
		const free = plan().until('2026-10-15');
		const result = fittings(
			[todo(1, { estimate: Math.round(free * 0.9), dueDate: '2026-10-15' })],
			plan(),
			TODAY,
			END
		);
		expect(result.get(1)?.fit).toBe('tight');
	});

	test('a to-do that needs more than the free time does not fit', () => {
		const result = fittings(
			[todo(1, { estimate: 2000, dueDate: '2026-10-15' })],
			plan(),
			TODAY,
			END
		);
		expect(result.get(1)?.fit).toBe('no-fit');
	});

	test('to-dos share the time: the second is judged with the first', () => {
		// Free: 1152 min by Oct 15 and 1728 min by Oct 16
		const result = fittings(
			[
				todo(1, { estimate: 400, dueDate: '2026-10-15' }),
				todo(2, { estimate: 1500, dueDate: '2026-10-16' })
			],
			plan(),
			TODAY,
			END
		);
		expect(result.get(1)?.fit).toBe('on-track');
		expect(result.get(2)?.fit).toBe('no-fit');
		expect(result.get(2)?.need).toBe(1900);
	});

	test('progress takes the finished part off', () => {
		const result = fittings(
			[todo(1, { estimate: 2000, progress: 90, dueDate: '2026-10-15' })],
			plan(),
			TODAY,
			END
		);
		expect(result.get(1)?.fit).toBe('on-track');
	});

	test('a to-do without a date, a done one and a dropped one are not judged', () => {
		const result = fittings(
			[todo(1, { dueDate: null }), todo(2, { status: 'done' }), todo(3, { status: 'dropped' })],
			plan(),
			TODAY,
			END
		);
		expect(result.size).toBe(0);
	});

	test('an overdue to-do is judged against what is left of today', () => {
		const result = fittings(
			[todo(1, { estimate: 600, dueDate: '2026-10-10' })],
			plan({ now: 20 * 60 }),
			TODAY,
			END
		);
		expect(result.get(1)?.fit).toBe('no-fit');
	});

	test('a due time cuts the day short', () => {
		const late = fittings(
			[todo(1, { estimate: 300, dueDate: TODAY, dueTime: null })],
			plan(),
			TODAY,
			END
		);
		const early = fittings(
			[todo(1, { estimate: 300, dueDate: TODAY, dueTime: 10 * 60 })],
			plan(),
			TODAY,
			END
		);
		expect(late.get(1)?.fit).toBe('on-track');
		expect(early.get(1)?.fit).toBe('no-fit');
	});

	test('nothing free at all does not fit, however small the to-do', () => {
		const result = fittings(
			[todo(1, { estimate: 15, dueDate: TODAY })],
			plan({ now: 23 * 60 }),
			TODAY,
			END
		);
		expect(result.get(1)).toEqual({ fit: 'no-fit', need: 15, free: 0 });
	});

	test('to-dos due at the same time are ordered by priority, then id', () => {
		const result = fittings(
			[
				todo(2, { estimate: 300, dueDate: '2026-10-15', priority: Priority.Low }),
				todo(1, { estimate: 300, dueDate: '2026-10-15', priority: Priority.Critical })
			],
			plan(),
			TODAY,
			END
		);
		expect(result.get(1)?.need).toBe(300);
		expect(result.get(2)?.need).toBe(600);
	});
});

describe('four exams over three weeks', () => {
	const exams = [
		todo(1, { title: 'Exam Math', estimate: 15 * 60, dueDate: '2026-11-04' }),
		todo(2, { title: 'Exam Physics', estimate: 12 * 60, dueDate: '2026-11-04' }),
		todo(3, { title: 'Exam History', estimate: 10 * 60, dueDate: '2026-11-04' }),
		todo(4, { title: 'Exam Law', estimate: 15 * 60, dueDate: '2026-11-04' })
	];
	/** A lecture, lunch and an evening each weekday: 5 h taken. */
	const busy = Array.from({ length: 22 }, (_, day) => {
		const date = new Date(Date.UTC(2026, 9, 14 + day)).toISOString().slice(0, 10);
		return [task(date, 9 * 60, 180), task(date, 18 * 60, 120)];
	}).flat();

	test('52 hours of study fit into three weeks of work days', () => {
		const result = fittings(exams, plan({ tasks: busy }), TODAY, END);
		expect([...result.values()].map(({ fit }) => fit)).not.toContain('no-fit');
		expect(overbookedLine(exams, plan({ tasks: busy }), TODAY, END)).toBeNull();
	});

	/** Appointments from 08:00 to 21:00 every day: 3 h of the day are free. */
	const full = Array.from({ length: 22 }, (_, day) => {
		const date = new Date(Date.UTC(2026, 9, 14 + day)).toISOString().slice(0, 10);
		return task(date, 8 * 60, 13 * 60);
	});

	test('the same exams do not fit when the weeks are filled with appointments', () => {
		const capacity = plan({ tasks: full });
		expect(fittings(exams, capacity, TODAY, END).get(4)?.fit).toBe('no-fit');
		expect(overbookedLine(exams, capacity, TODAY, END)).toBe(
			'Your to-dos due by Nov 4 need about 52 h, about 40 h are free.'
		);
	});

	test('one exam dropped gives the time back', () => {
		const left = exams.filter((exam) => exam.id !== 4);
		const capacity = plan({ tasks: full });
		expect(overbookedLine(left, capacity, TODAY, END)).toBeNull();
		expect(fittings(left, capacity, TODAY, END).get(3)?.fit).toBe('tight');
	});
});

describe('overbookedLine', () => {
	test('says nothing without to-dos', () => {
		expect(overbookedLine([], plan(), TODAY, END)).toBeNull();
	});

	test('names the first day that is overbooked, with the sum of everything due by then', () => {
		const todos = [
			todo(1, { estimate: 300, dueDate: '2026-10-15' }),
			todo(2, { estimate: 2400, dueDate: '2026-10-16' })
		];
		expect(overbookedLine(todos, plan(), TODAY, END)).toBe(
			'Your to-dos due by Oct 16 need about 45 h, about 29 h are free.'
		);
	});

	test('a day is judged once, with everything due on it', () => {
		const todos = [
			todo(1, { estimate: 1200, dueDate: '2026-10-15' }),
			todo(2, { estimate: 1200, dueDate: '2026-10-15' })
		];
		expect(overbookedLine(todos, plan(), TODAY, END)).toBe(
			'Your to-dos due by Oct 15 need about 40 h, about 19 h are free.'
		);
	});

	test('due today says today', () => {
		const todos = [todo(1, { estimate: 900, dueDate: TODAY })];
		expect(overbookedLine(todos, plan({ now: 15 * 60 }), TODAY, END)).toBe(
			'Your to-dos due today need about 15 h, about 4 h 45 min are free.'
		);
	});

	test('nothing left is said as none', () => {
		const todos = [todo(1, { estimate: 60, dueDate: TODAY })];
		expect(overbookedLine(todos, plan({ now: 23 * 60 }), TODAY, END)).toBe(
			'Your to-dos due today need about 1 h, none is free.'
		);
	});

	test('a to-do without a date is not counted', () => {
		expect(
			overbookedLine([todo(1, { estimate: 99999, dueDate: null })], plan(), TODAY, END)
		).toBeNull();
	});
});

describe('words', () => {
	test('a short date names the month and the day', () => {
		expect(shortDate('2026-11-05')).toBe('Nov 5');
	});

	test('only a row that is not on track has words', () => {
		expect(fitWords(undefined)).toBeNull();
		expect(fitWords({ fit: 'on-track', need: 1, free: 2 })).toBeNull();
		expect(fitWords({ fit: 'tight', need: 9, free: 10 })).toBe('Tight');
		expect(fitWords({ fit: 'no-fit', need: 11, free: 10 })).toBe('Does not fit');
	});
});
