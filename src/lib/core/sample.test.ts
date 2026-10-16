/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import type { Routine } from '#lib/core/repo.js';
import {
	SAMPLE_DAYS,
	SAMPLE_PREP,
	sampleDay,
	sampleRoutines,
	sampleTodos
} from '#lib/core/sample.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { prepPlan } from '#lib/prep.js';
import { rank } from '#lib/priority.js';
import { routineDays, routineTask } from '#lib/recurrence.js';
import { addDays } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

const TODAY = '2026-10-14'; // a Wednesday
const SETUP = 'Set up ADHD Tasker';
const ARRIVE_EARLY = 10;

/** What the tick makes of the sample's routines on `date`, with ids of their own. */
const routineTasks = (date: string) =>
	sampleRoutines().flatMap((patch, index) => {
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
	});

/** The whole sample as the device makes it: tasks, the appointment's travel and the routines' days. */
function week(today: string, now: number) {
	const tasks = sampleDay(today, now).map((task, id) => ({
		...task,
		status: task.status ?? TaskStatus.Pending,
		id: id + 1
	}));
	const appointment = tasks.find((task) => task.kind === 'appointment')!;
	const { travel } = prepPlan(appointment, SAMPLE_PREP, ARRIVE_EARLY);
	const days = Array.from({ length: SAMPLE_DAYS }, (_, index) => addDays(today, index));
	return [
		...tasks,
		...(travel ? [{ ...travel, id: 500, status: TaskStatus.Pending }] : []),
		...days.flatMap(routineTasks)
	];
}
const minute = fc.integer({ min: 0, max: DAY_MINUTES - 1 });

describe('sampleDay', () => {
	test('covers today and the six days after it, one task each', () => {
		const dates = sampleDay(TODAY, 12 * 60 + 8).map((task) => task.date);
		expect(dates).toEqual(Array.from({ length: SAMPLE_DAYS }, (_, index) => addDays(TODAY, index)));
	});

	test('the evening slot before dinner changes with the weekday', () => {
		const evening = sampleDay(TODAY, 12 * 60)
			.filter((task) => task.kind === undefined)
			.map((task) => task.title);
		expect(new Set(evening).size).toBe(SAMPLE_DAYS - 1);
	});

	test('one appointment two days ahead takes the evening slot of its day', () => {
		const appointments = sampleDay(TODAY, 0).filter((task) => task.kind === 'appointment');
		expect(appointments).toHaveLength(1);
		expect(appointments[0]).toMatchObject({
			title: 'Dentist',
			date: addDays(TODAY, 2),
			startTime: 17 * 60 + 30
		});
		expect(sampleDay(TODAY, 0).filter((task) => task.date === addDays(TODAY, 2))).toHaveLength(1);
	});

	test('what ended before now today is done, everything else is open', () => {
		const now = 17 * 60 + 30;
		for (const task of sampleDay(TODAY, now)) {
			const ended = task.date === TODAY && task.startTime + task.duration <= now;
			expect(task.status).toBe(ended ? TaskStatus.Completed : TaskStatus.Pending);
		}
	});

	test('no task is a free slot, the gaps stay empty', () => {
		for (const task of week(TODAY, 0)) expect(task.title.toLowerCase()).not.toContain('free');
	});
});

describe('sampleRoutines', () => {
	test('the essentials come first, then the repeating blocks of an ordinary day', () => {
		const titles = sampleRoutines().map((routine) => routine.title);
		expect(titles.slice(0, 5)).toEqual(['Meds', 'Breakfast', 'Lunch', 'Dinner', 'Go to bed']);
		expect(titles).toContain('Focus: the most important task');
		expect(titles).toContain('Exercise or a long walk');
	});

	test('focus blocks repeat on weekdays, the weekend has its own', () => {
		const repeat = (title: string) =>
			sampleRoutines().find((routine) => routine.title === title)?.repeat;
		expect(repeat('Focus: deep work')).toBe('weekdays');
		expect(repeat('A hobby or a project')).toBe('days:0,6');
		expect(repeat('Brush teeth')).toBe('daily');
	});

	test('a weekday has three focus blocks and a Saturday none', () => {
		const focusOn = (date: string) =>
			routineTasks(date).filter((task) => task.title.startsWith('Focus')).length;
		expect(focusOn(TODAY)).toBe(3);
		expect(focusOn(addDays(TODAY, 3))).toBe(0);
	});

	test('there are few enough for the limit of 50', () => {
		expect(sampleRoutines().length).toBeLessThan(40);
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

	test('the others have a size, and most a due date in the coming week', () => {
		const rest = sampleTodos(TODAY, 0).filter((todo) => todo.title !== SETUP);
		expect(rest.every((todo) => todo.estimate !== null && todo.estimate !== undefined)).toBe(true);
		const due = rest.filter((todo) => todo.dueDate);
		expect(due.length).toBeGreaterThanOrEqual(2);
		for (const todo of due) expect(todo.dueDate! <= addDays(TODAY, 6)).toBe(true);
	});

	test('a to-do has no time of its own', () => {
		for (const todo of sampleTodos(TODAY, 0)) expect(todo.dueTime ?? null).toBeNull();
	});
});

describe('the sample week', () => {
	test('a full day: lunch (a routine) is running at 12:08 and the walk is next', () => {
		const today = week(TODAY, 12 * 60 + 8).filter((task) => task.date === TODAY);
		expect(today.length).toBeGreaterThanOrEqual(15);
		const ranked = rank(today, 12 * 60 + 8);
		expect(ranked.current?.title).toBe('Lunch');
		expect(ranked.upcoming[0]?.title).toBe('Short walk outside');
	});

	test('the appointment has travel that ends before it and steps due when travel starts', () => {
		const appointment = sampleDay(TODAY, 0)
			.map((task, id) => ({ ...task, id: id + 1 }))
			.find((task) => task.kind === 'appointment')!;
		const plan = prepPlan(appointment, SAMPLE_PREP, ARRIVE_EARLY);
		expect(plan.travel).toMatchObject({
			kind: 'travel',
			parentId: appointment.id,
			startTime: 16 * 60 + 50,
			duration: 30
		});
		expect(plan.todos).toHaveLength(2);
		for (const todo of plan.todos)
			expect(todo).toMatchObject({
				parentId: appointment.id,
				dueDate: appointment.date,
				dueTime: 16 * 60 + 50
			});
	});

	test.each(Array.from({ length: 7 }, (_, offset) => [addDays('2026-10-12', offset)]))(
		'starting on %s, no day has two things at once and none crosses midnight',
		(start) => {
			const byDay = Map.groupBy(week(start, 0), (task) => task.date);
			for (const tasks of byDay.values()) {
				const sorted = tasks.toSorted((a, b) => a.startTime - b.startTime);
				for (const [index, task] of sorted.entries()) {
					expect(task.startTime + task.duration).toBeLessThanOrEqual(DAY_MINUTES);
					if (index > 0)
						expect(task.startTime).toBeGreaterThanOrEqual(
							sorted[index - 1].startTime + sorted[index - 1].duration
						);
				}
			}
		}
	);

	test('the gaps are left for to-dos and none is longer than two hours', () => {
		fc.assert(
			fc.property(minute, (now) => {
				const byDay = Map.groupBy(week(TODAY, now), (task) => task.date);
				for (const tasks of byDay.values()) {
					const sorted = tasks.toSorted((a, b) => a.startTime - b.startTime);
					for (const [index, task] of sorted.entries()) {
						if (index === 0 || task.startTime > 22 * 60) continue;
						const gap = task.startTime - (sorted[index - 1].startTime + sorted[index - 1].duration);
						expect(gap).toBeLessThanOrEqual(120);
					}
				}
			}),
			{ numRuns: 20 }
		);
	});
});
