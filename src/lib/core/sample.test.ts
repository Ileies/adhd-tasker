/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Routine } from '#lib/core/repo.js';
import { SAMPLE_DAYS, sampleRoutines, sampleTodos } from '#lib/core/sample.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { rank } from '#lib/priority.js';
import { routineDays, routineTask } from '#lib/recurrence.js';
import { addDays } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

const TODAY = '2026-10-14'; // a Wednesday
const SATURDAY = '2026-10-17';
const SETUP = 'Set up ADHD Tasker';
const WORK = 'Work or school';

/** What the tick makes of the sample's routines on `date`, with ids of their own, in time order. */
const day = (date: string) =>
	sampleRoutines()
		.flatMap((patch, index) => {
			const routine = {
				id: index + 1,
				description: '',
				kind: 'block',
				firstDay: TODAY,
				lastDay: null,
				through: null,
				shift: 0,
				...patch
			} as Routine;
			return routineDays(routine, date, date).map(() => ({
				...routineTask(routine, date),
				status: TaskStatus.Pending,
				id: 1000 + index
			}));
		})
		.toSorted((a, b) => a.startTime - b.startTime);

/** The free minutes between the routines of a day. */
const gaps = (date: string) =>
	day(date).flatMap((task, index, all) => {
		const next = all[index + 1];
		return next ? [next.startTime - (task.startTime + task.duration)] : [];
	});

describe('sampleRoutines', () => {
	test('the meals, teeth and bed, and no meds: most people take none', () => {
		const titles = sampleRoutines().map((routine) => routine.title);
		expect(titles.slice(0, 5)).toEqual([
			'Breakfast',
			'Lunch',
			'Dinner',
			'Brush teeth',
			'Go to bed'
		]);
		expect(titles).not.toContain('Meds');
	});

	test('what is over for today starts tomorrow, so a first visitor has nothing done or missed already', () => {
		const first = Object.fromEntries(
			sampleRoutines({ today: TODAY, minutes: 22 * 60 + 35 }).map((routine) => [
				`${routine.title}${routine.startTime}`,
				routine.firstDay
			])
		);
		expect(first['Brush teeth1350']).toBe(TODAY);
		expect(first['Go to bed1365']).toBe(TODAY);
		expect(first['Dinner1080']).toBe(addDays(TODAY, 1));
		expect(first[`${WORK}540`]).toBe(addDays(TODAY, 1));
	});

	test('work or school runs on weekdays around lunch and ends on its own', () => {
		const work = sampleRoutines().filter((routine) => routine.title === WORK);
		expect(work.map((routine) => [routine.startTime, routine.duration])).toEqual([
			[9 * 60, 180],
			[13 * 60, 240]
		]);
		for (const routine of work)
			expect(routine).toMatchObject({ repeat: 'weekdays', kind: 'appointment' });
	});

	test('nothing else is in the week: every routine is a meal, bed or work', () => {
		const titles = new Set(sampleRoutines().map((routine) => routine.title));
		expect([...titles].toSorted()).toEqual(
			['Breakfast', 'Brush teeth', 'Dinner', 'Go to bed', 'Lunch', WORK].toSorted()
		);
	});

	test.each(Array.from({ length: SAMPLE_DAYS }, (_, offset) => [addDays(TODAY, offset)]))(
		'on %s no two routines overlap and none crosses midnight',
		(date) => {
			for (const [index, task] of day(date).entries()) {
				expect(task.startTime + task.duration).toBeLessThanOrEqual(DAY_MINUTES);
				const before = day(date)[index - 1];
				if (before)
					expect(task.startTime).toBeGreaterThanOrEqual(before.startTime + before.duration);
			}
		}
	);

	test.each([
		['a weekday', TODAY, 3],
		['a Saturday', SATURDAY, 3]
	])('%s keeps an evening of at least %i h for the to-dos', (_name, date, hours) => {
		expect(Math.max(...gaps(date))).toBeGreaterThanOrEqual(hours * 60);
	});

	test.each([
		['at 10:00 work is current', 10 * 60, WORK, 'Lunch'],
		['at 12:08 lunch is current and work is next', 12 * 60 + 8, 'Lunch', WORK],
		['at 17:30 nothing is at a time and dinner is next', 17 * 60 + 30, undefined, 'Dinner']
	])('a weekday: %s', (_name, now, current, next) => {
		const ranked = rank(day(TODAY), now);
		expect(ranked.current?.title).toBe(current);
		expect(ranked.upcoming[0]?.title).toBe(next);
	});

	test('a Saturday has no work', () => {
		expect(day(SATURDAY).map((task) => task.title)).not.toContain(WORK);
	});
});

describe('sampleTodos', () => {
	test.each([
		['at noon', 12 * 60, TODAY],
		['just before 20:00', 20 * 60 - 1, TODAY],
		['at 20:00', 20 * 60, addDays(TODAY, 1)],
		['late in the evening', 22 * 60, addDays(TODAY, 1)]
	])('the setup is one to-do of 15 min, started %s it is due %s', (_when, now, dueDate) => {
		const setup = sampleTodos(TODAY, now).filter((todo) => todo.title === SETUP);
		expect(setup).toHaveLength(1);
		expect(setup[0]).toMatchObject({ dueDate, estimate: 15 });
	});

	test('the chores have a size and are due by the end of the week, with no time of their own', () => {
		const chores = sampleTodos(TODAY, 0).filter((todo) => todo.title !== SETUP);
		expect(chores.map((todo) => todo.title)).toEqual([
			'Buy groceries',
			'Do the laundry',
			'Clean up at home',
			'Reply to messages'
		]);
		for (const todo of chores) {
			expect(todo.estimate).toBeGreaterThan(0);
			expect(todo.dueDate).toBe(addDays(TODAY, SAMPLE_DAYS - 1));
			expect(todo.dueTime ?? null).toBeNull();
		}
	});

	test('two chores are big enough for Now to hold a session and rotate between them', () => {
		const big = sampleTodos(TODAY, 0).filter((todo) => (todo.estimate ?? 0) >= 90);
		expect(big.map((todo) => todo.title)).toEqual(['Do the laundry', 'Clean up at home']);
	});
});
