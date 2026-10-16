/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	CONTINUITY_MAX_MINUTES,
	daysBetween,
	isCandidate,
	pick,
	remainingMinutes,
	type PickInput,
	type PickTodo
} from '#lib/pick.js';
import { Priority } from '#lib/types.js';

const DATE = '2026-10-14';
const NOW = 10 * 60;
const MY_DAY_END = 23 * 60;

const todo = (id: number, patch: Partial<PickTodo> = {}): PickTodo => ({
	id,
	title: `Study ${id}`,
	priority: Priority.Medium,
	estimate: 900,
	progress: 0,
	dueDate: '2026-11-03',
	dueTime: null,
	notBefore: null,
	status: 'open',
	...patch
});

/** A free day: nothing else is booked, so free time is simply what is left of the clock. */
const input = (
	todos: PickTodo[],
	patch: Partial<PickInput<PickTodo>> = {}
): PickInput<PickTodo> => ({
	todos,
	date: DATE,
	now: NOW,
	myDayEnd: MY_DAY_END,
	spent: new Map(),
	previousId: null,
	freeLeft: MY_DAY_END - NOW,
	freeUntil: (minute) => Math.max(0, minute - NOW),
	...patch
});

describe('remainingMinutes', () => {
	test.each([
		['a size with nothing done', { estimate: 900, progress: 0 }, 900],
		['a size half done', { estimate: 900, progress: 50 }, 450],
		['no size counts as an hour', { estimate: null, progress: 0 }, 60],
		['no size, half done', { estimate: null, progress: 50 }, 30],
		['almost done is at least five minutes', { estimate: 30, progress: 99 }, 5]
	])('%s', (_name, fields, expected) => {
		expect(remainingMinutes(fields)).toBe(expected);
	});
});

describe('isCandidate', () => {
	test.each([
		['open', { status: 'open', notBefore: null }, true],
		['done', { status: 'done', notBefore: null }, false],
		['dropped', { status: 'dropped', notBefore: null }, false],
		['ended with its appointment', { status: 'ended', notBefore: null }, false],
		['held back until tomorrow', { status: 'open', notBefore: '2026-10-15' }, false],
		['held back until today', { status: 'open', notBefore: DATE }, true]
	] as const)('%s', (_name, fields, expected) => {
		expect(isCandidate(fields, DATE)).toBe(expected);
	});
});

test('daysBetween counts whole days in both directions', () => {
	expect(daysBetween('2026-10-14', '2026-11-03')).toBe(20);
	expect(daysBetween('2026-11-03', '2026-10-14')).toBe(-20);
	expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
});

describe('pick', () => {
	test('nothing is picked when no to-do is open and ready', () => {
		expect(pick(input([]))).toBeNull();
		expect(
			pick(input([todo(1, { status: 'done' }), todo(2, { notBefore: '2026-10-20' })]))
		).toBeNull();
	});

	test('a single open to-do is current, whatever it is worth', () => {
		const result = pick(input([todo(1, { priority: Priority.Low, dueDate: '2036-10-14' })]));
		expect(result).toMatchObject({ todo: { id: 1 }, why: 'only', line: 'Nothing else is open.' });
	});

	test('a to-do held back by "not before" is not picked, the other one is', () => {
		const result = pick(input([todo(1, { notBefore: '2026-10-20' }), todo(2)]));
		expect(result?.todo.id).toBe(2);
	});

	describe('urgent first', () => {
		test('one due today that no longer fits goes before everything else', () => {
			const result = pick(
				input([
					todo(1, { priority: Priority.Critical }),
					todo(2, { estimate: 120, dueDate: DATE, dueTime: 12 * 60 })
				])
			);
			expect(result).toMatchObject({ todo: { id: 2 }, why: 'urgent' });
			expect(result?.line).toBe('Due at 12:00, about 2 h left to do.');
		});

		test('one due today with room to spare is not urgent', () => {
			const result = pick(
				input([
					todo(1, { priority: Priority.Critical }),
					todo(2, { estimate: 60, dueDate: DATE, dueTime: 15 * 60 })
				])
			);
			expect(result?.why).not.toBe('urgent');
		});

		test('the spare time counts: it fits only when 30 minutes are left over', () => {
			const fits = pick(
				input([todo(1), todo(2, { estimate: 90, dueDate: DATE, dueTime: 12 * 60 })])
			);
			expect(fits?.why).not.toBe('urgent');
			const tight = pick(
				input([todo(1), todo(2, { estimate: 91, dueDate: DATE, dueTime: 12 * 60 })])
			);
			expect(tight?.why).toBe('urgent');
		});

		test('free time taken by appointments makes it urgent', () => {
			const busy = input([todo(1), todo(2, { estimate: 60, dueDate: DATE, dueTime: 15 * 60 })], {
				freeUntil: (minute) => Math.max(0, minute - NOW - 240)
			});
			expect(pick(busy)?.why).toBe('urgent');
		});

		test('a to-do without a time is due at the end of My day', () => {
			const result = pick(input([todo(1, { estimate: 800, dueDate: DATE })]));
			expect(result?.line).toBe('Due today, about 13 h 20 min left to do.');
		});

		test('overdue counts as today and says so', () => {
			const result = pick(input([todo(1, { estimate: 780, dueDate: '2026-10-10' }), todo(2)]));
			expect(result).toMatchObject({ todo: { id: 1 }, why: 'urgent' });
			expect(result?.line).toBe('Overdue, about 13 h left to do.');
		});

		test('among urgent ones the earliest due goes first', () => {
			const result = pick(
				input([
					todo(1, { estimate: 300, dueDate: DATE, dueTime: 16 * 60 }),
					todo(2, { estimate: 300, dueDate: DATE, dueTime: 14 * 60 }),
					todo(3, { estimate: 1000, dueDate: '2026-10-10' })
				])
			);
			expect(result?.todo.id).toBe(3);
			const without = pick(
				input([
					todo(1, { estimate: 300, dueDate: DATE, dueTime: 16 * 60 }),
					todo(2, { estimate: 300, dueDate: DATE, dueTime: 14 * 60 })
				])
			);
			expect(without?.todo.id).toBe(2);
		});
	});

	describe('fair share', () => {
		test('equal to-dos: the one with less time today goes next', () => {
			const todos = [todo(1), todo(2), todo(3), todo(4)];
			const spent = new Map([
				[1, 60],
				[2, 30],
				[3, 60],
				[4, 60]
			]);
			expect(pick(input(todos, { spent }))?.todo.id).toBe(2);
		});

		test('four equal to-dos start with the one due first, then the lowest id', () => {
			const todos = [
				todo(1, { dueDate: '2026-11-05' }),
				todo(2, { dueDate: '2026-11-03' }),
				todo(3, { dueDate: '2026-11-04' }),
				todo(4, { dueDate: '2026-11-03' })
			];
			expect(pick(input(todos))?.todo.id).toBe(2);
		});

		test('a nearer due date has the bigger need per day', () => {
			const result = pick(
				input([todo(1, { dueDate: '2026-12-20' }), todo(2, { dueDate: '2026-10-20' })])
			);
			expect(result?.todo.id).toBe(2);
		});

		test('a higher priority has the bigger share', () => {
			const result = pick(
				input([todo(1, { priority: Priority.Low }), todo(2, { priority: Priority.Critical })])
			);
			expect(result?.todo.id).toBe(2);
		});

		test('a to-do without a due date still has a small need and is picked when nothing else is open', () => {
			const result = pick(
				input([todo(1, { dueDate: null, estimate: null, priority: Priority.Low })])
			);
			expect(result?.todo.id).toBe(1);
		});

		test('every share is used up when the first one is well ahead', () => {
			// 1 is far ahead of its share, so 2 goes next even though both are equal
			const spent = new Map([[1, 300]]);
			expect(pick(input([todo(1), todo(2)], { spent }))?.todo.id).toBe(2);
		});

		test('the line names the days and how much today keeps it on track', () => {
			const result = pick(
				input([
					todo(1, { estimate: 900, dueDate: '2026-10-26' }),
					todo(2, { estimate: 60, dueDate: '2027-01-01' })
				])
			);
			expect(result?.why).toBe('share');
			expect(result?.line).toBe('Due in 12 days. About 1 h 10 min today keeps you on track.');
		});

		test.each([
			['tomorrow', '2026-10-15', 'Due tomorrow.'],
			['in a week', '2026-10-21', 'Due in 7 days.']
		])('a to-do due %s says so', (_name, dueDate, start) => {
			const result = pick(
				input([todo(1, { dueDate, estimate: 40 }), todo(2, { estimate: 5, dueDate: '2027-01-01' })])
			);
			expect(result?.line.startsWith(start)).toBe(true);
		});

		test('without a due date the line says nothing is due', () => {
			const result = pick(
				input([todo(1, { dueDate: null }), todo(2, { dueDate: null, priority: Priority.Low })])
			);
			expect(result?.line).toBe('Nothing is due, it has had the least time today.');
		});
	});

	describe('continuity', () => {
		const pair = [todo(1), todo(2, { priority: Priority.High })];

		test('the to-do of the last session stays while it is still behind its share', () => {
			// With a high priority 2 would win, but 1 was just worked on and is still behind
			const result = pick(input(pair, { previousId: 1, spent: new Map([[1, 10]]) }));
			expect(result).toMatchObject({ todo: { id: 1 }, why: 'continuity' });
		});

		test('it leaves once it is ahead of its share', () => {
			const result = pick(input(pair, { previousId: 1, spent: new Map([[1, 400]]) }));
			expect(result?.todo.id).toBe(2);
		});

		test('it leaves after two hours today', () => {
			const spent = new Map([[1, CONTINUITY_MAX_MINUTES]]);
			expect(pick(input(pair, { previousId: 1, spent }))?.todo.id).toBe(2);
		});

		test('a previous to-do that is no longer open is not kept', () => {
			expect(pick(input([todo(2)], { previousId: 1 }))?.why).toBe('only');
		});
	});

	test('a pick is always one of the open to-dos, or null when there is none', () => {
		const arbitrary = fc.record({
			id: fc.integer({ min: 1, max: 50 }),
			priority: fc.constantFrom(1, 2, 3, 4, 5),
			estimate: fc.option(fc.integer({ min: 1, max: 3000 }), { nil: null }),
			progress: fc.integer({ min: 0, max: 100 }),
			dueDate: fc.option(fc.constantFrom('2026-10-10', DATE, '2026-10-15', '2026-12-01'), {
				nil: null
			}),
			dueTime: fc.option(fc.integer({ min: 0, max: 1439 }), { nil: null }),
			notBefore: fc.option(fc.constantFrom('2026-10-01', '2026-10-20'), { nil: null }),
			status: fc.constantFrom('open', 'done', 'dropped', 'ended')
		});
		fc.assert(
			fc.property(
				fc.uniqueArray(arbitrary, { selector: (entry) => entry.id, maxLength: 8 }),
				(todos) => {
					const typed = todos.map((entry) => ({
						...entry,
						title: 't',
						priority: entry.priority as Priority,
						status: entry.status as PickTodo['status']
					}));
					const result = pick(input(typed));
					const open = typed.filter((entry) => isCandidate(entry, DATE));
					if (open.length === 0) expect(result).toBeNull();
					else {
						expect(open.map((entry) => entry.id)).toContain(result!.todo.id);
						expect(result!.line.length).toBeGreaterThan(0);
					}
				}
			)
		);
	});
});
