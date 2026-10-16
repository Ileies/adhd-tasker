/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import type { Routine, Task } from '#lib/core/repo.js';
import {
	ROUTINE_AHEAD_DAYS,
	daysToMake,
	followsRoutine,
	horizon,
	needsMaking,
	planDelete,
	planEdit,
	routineDays,
	routineTask
} from '#lib/recurrence.js';
import { repeatFromDays, repeatsOn, type Repeat } from '#lib/schedule.js';
import { addDays, todayIn, weekdayOf } from '#lib/time.js';
import { Priority, TaskStatus } from '#lib/types.js';

// 2026-10-14 is a Wednesday
const TODAY = '2026-10-14';

const lunch = (patch: Partial<Routine> = {}): Routine => ({
	id: 1,
	title: 'Lunch',
	description: '',
	priority: Priority.Medium,
	startTime: 720,
	duration: 45,
	shift: 60,
	kind: 'block',
	repeat: 'daily',
	firstDay: TODAY,
	lastDay: null,
	through: null,
	...patch
});

/** The task a routine made for a day, as the repo would hold it. */
const made = (routine: Routine, date: string, id: number, patch: Partial<Task> = {}): Task => ({
	...routineTask(routine, date),
	id,
	status: TaskStatus.Pending,
	completedAt: null,
	kind: routine.kind,
	parentId: null,
	shift: routine.shift,
	routineId: routine.id,
	...patch
});

describe('routineDays', () => {
	test('daily has every day, both ends included', () => {
		expect(routineDays(lunch(), '2026-10-14', '2026-10-17')).toEqual([
			'2026-10-14',
			'2026-10-15',
			'2026-10-16',
			'2026-10-17'
		]);
	});

	test('weekdays skip the weekend', () => {
		expect(routineDays(lunch({ repeat: 'weekdays' }), '2026-10-14', '2026-10-20')).toEqual([
			'2026-10-14',
			'2026-10-15',
			'2026-10-16',
			'2026-10-19',
			'2026-10-20'
		]);
	});

	test('named days are the ones with that weekday number', () => {
		expect(routineDays(lunch({ repeat: 'days:1,3' }), '2026-10-14', '2026-10-27')).toEqual([
			'2026-10-14',
			'2026-10-19',
			'2026-10-21',
			'2026-10-26'
		]);
	});

	test('nothing before the first day or after the last', () => {
		const routine = lunch({ firstDay: '2026-10-16', lastDay: '2026-10-18' });
		expect(routineDays(routine, '2026-10-10', '2026-10-30')).toEqual([
			'2026-10-16',
			'2026-10-17',
			'2026-10-18'
		]);
	});

	test('a range that ends before it starts has no days', () => {
		expect(routineDays(lunch(), '2026-10-20', '2026-10-14')).toEqual([]);
	});

	test('the last day of a month and of a year roll over', () => {
		expect(routineDays(lunch(), '2026-12-30', '2027-01-02')).toEqual([
			'2026-12-30',
			'2026-12-31',
			'2027-01-01',
			'2027-01-02'
		]);
		expect(routineDays(lunch(), '2028-02-28', '2028-03-01')).toHaveLength(3);
	});
});

describe('what the tick makes', () => {
	test('the first tick makes today and the 13 days after it', () => {
		const days = daysToMake(lunch(), TODAY);
		expect(days).toHaveLength(ROUTINE_AHEAD_DAYS);
		expect(days[0]).toBe(TODAY);
		expect(days.at(-1)).toBe(horizon(TODAY));
		expect(horizon(TODAY)).toBe('2026-10-27');
	});

	test('a routine that starts later waits for its first day', () => {
		expect(daysToMake(lunch({ firstDay: '2026-10-20' }), TODAY)[0]).toBe('2026-10-20');
	});

	test('once made, nothing is made until the next day', () => {
		const done = lunch({ through: horizon(TODAY) });
		expect(needsMaking(done, TODAY)).toBe(false);
		expect(daysToMake(done, TODAY)).toEqual([]);
	});

	test('the next day adds exactly one more', () => {
		const done = lunch({ through: horizon(TODAY) });
		const tomorrow = addDays(TODAY, 1);
		expect(needsMaking(done, tomorrow)).toBe(true);
		expect(daysToMake(done, tomorrow)).toEqual([horizon(tomorrow)]);
	});

	test('a day that was deleted is not made again', () => {
		// 2026-10-16 was made and deleted by the user, the tick only looks past `through`
		const done = lunch({ through: horizon(TODAY) });
		expect(daysToMake(done, '2026-10-17')).not.toContain('2026-10-16');
	});

	test('after days away it starts at today, never in the past', () => {
		const old = lunch({ through: '2026-10-01' });
		expect(daysToMake(old, TODAY)[0]).toBe(TODAY);
	});

	test('a routine whose last day passed makes nothing but still moves on', () => {
		const ended = lunch({ lastDay: '2026-10-10', through: '2026-10-10' });
		expect(daysToMake(ended, TODAY)).toEqual([]);
		expect(needsMaking(ended, TODAY)).toBe(true);
	});
});

describe('routineTask', () => {
	test('a day of the routine is a pending task of it with its fields', () => {
		expect(routineTask(lunch({ kind: 'appointment' }), '2026-10-15')).toEqual({
			title: 'Lunch',
			description: '',
			date: '2026-10-15',
			startTime: 720,
			duration: 45,
			priority: Priority.Medium,
			kind: 'appointment',
			shift: 60,
			status: TaskStatus.Pending,
			routineId: 1
		});
	});
});

describe('followsRoutine', () => {
	const routine = lunch();

	test('a task as the routine made it follows it', () => {
		expect(followsRoutine(made(routine, TODAY, 5), routine)).toBe(true);
	});

	test.each([
		['moved', { startTime: 750 }],
		['renamed', { title: 'Late lunch' }],
		['given more time', { duration: 60 }],
		['given another priority', { priority: Priority.High }],
		['finished', { status: TaskStatus.Completed }]
	])("a task that was %s is the user's own", (_name, patch) => {
		expect(followsRoutine(made(routine, TODAY, 5, patch), routine)).toBe(false);
	});

	test('changing it back makes it follow the routine again', () => {
		const moved = made(routine, TODAY, 5, { startTime: 750 });
		expect(followsRoutine({ ...moved, startTime: 720 }, routine)).toBe(true);
	});
});

describe('planEdit', () => {
	const before = lunch({ through: horizon(TODAY) });
	const week = (routine: Routine) =>
		routineDays(routine, TODAY, '2026-10-20').map((date, i) => made(routine, date, 10 + i));

	test('a new time changes every task that follows the routine', () => {
		const after = { ...before, startTime: 750 };
		const edit = planEdit(before, after, week(before), TODAY);
		expect(edit.change).toHaveLength(7);
		expect(edit.change[0]).toEqual({ id: 10, patch: { startTime: 750 } });
		expect(edit.remove).toEqual([]);
	});

	test('a task the user changed keeps its changes, the others follow', () => {
		const tasks = week(before);
		tasks[2] = { ...tasks[2], startTime: 800 };
		const edit = planEdit(before, { ...before, title: 'Meal' }, tasks, TODAY);
		expect(edit.change.map((entry) => entry.id)).not.toContain(tasks[2].id);
		expect(edit.change).toHaveLength(6);
	});

	test('a finished task stays and is not made again', () => {
		const tasks = week(before);
		tasks[0] = { ...tasks[0], status: TaskStatus.Completed };
		const edit = planEdit(before, { ...before, startTime: 750 }, tasks, TODAY);
		expect(edit.change.map((entry) => entry.id)).not.toContain(tasks[0].id);
		expect(edit.make).not.toContain(TODAY);
	});

	test('days the routine no longer has lose their task', () => {
		const edit = planEdit(before, { ...before, repeat: 'weekdays' }, week(before), TODAY);
		expect(edit.remove).toHaveLength(2);
		expect(edit.change).toEqual([]);
	});

	test('a changed task on a day that is no longer there stays', () => {
		const tasks = week(before);
		const saturday = tasks.findIndex((task) => weekdayOf(task.date) === 6);
		tasks[saturday] = { ...tasks[saturday], title: 'Picnic' };
		const edit = planEdit(before, { ...before, repeat: 'weekdays' }, tasks, TODAY);
		expect(edit.remove).toHaveLength(1);
	});

	test('new days of the routine are made', () => {
		const weekdays = lunch({ repeat: 'weekdays', through: horizon(TODAY) });
		const tasks = routineDays(weekdays, TODAY, '2026-10-20').map((date, i) =>
			made(weekdays, date, i + 1)
		);
		const edit = planEdit(weekdays, { ...weekdays, repeat: 'daily' }, tasks, TODAY);
		const wanted = routineDays(lunch(), TODAY, horizon(TODAY));
		expect(edit.make).toEqual(wanted.filter((date) => !tasks.some((task) => task.date === date)));
		expect(edit.make).toContain('2026-10-17');
	});

	test('a last day takes the later tasks away', () => {
		const edit = planEdit(before, { ...before, lastDay: '2026-10-16' }, week(before), TODAY);
		expect(edit.remove).toHaveLength(4);
	});

	test('an edit that changes nothing touches nothing', () => {
		const tasks = routineDays(before, TODAY, horizon(TODAY)).map((date, i) =>
			made(before, date, i + 1)
		);
		expect(planEdit(before, { ...before }, tasks, TODAY)).toEqual({
			change: [],
			remove: [],
			make: []
		});
	});
});

describe('planDelete', () => {
	test('every task from today on that is not done goes, the past and the done stay', () => {
		const routine = lunch();
		const tasks = [
			made(routine, '2026-10-13', 1),
			made(routine, TODAY, 2, { status: TaskStatus.Completed }),
			made(routine, '2026-10-15', 3),
			made(routine, '2026-10-16', 4, { title: 'Picnic' })
		];
		expect(planDelete(tasks, TODAY)).toEqual([3, 4]);
	});
});

describe('properties', () => {
	const repeats = fc
		.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1 })
		.map((days) => repeatFromDays(days) as Exclude<Repeat, 'none'>);
	const day = fc
		.integer({ min: Date.parse('2026-01-01T00:00:00Z'), max: Date.parse('2028-12-31T00:00:00Z') })
		.map((ms) => new Date(ms).toISOString().slice(0, 10));
	const span = fc.integer({ min: 0, max: 60 });

	test('the days are in order, inside the range and on the weekdays of the repeat', () => {
		fc.assert(
			fc.property(repeats, day, day, span, span, (repeat, first, from, length, last) => {
				const routine = lunch({
					repeat,
					firstDay: first,
					lastDay: last % 2 === 0 ? addDays(first, last) : null
				});
				const to = addDays(from, length);
				const days = routineDays(routine, from, to);
				expect(days).toEqual([...new Set(days)].sort());
				for (const date of days) {
					expect(date >= from && date <= to && date >= first).toBe(true);
					if (routine.lastDay !== null) expect(date <= routine.lastDay).toBe(true);
					expect(repeatsOn(repeat, weekdayOf(date))).toBe(true);
				}
			})
		);
	});

	test('no day of the repeat is left out', () => {
		fc.assert(
			fc.property(repeats, day, span, (repeat, from, length) => {
				const routine = lunch({ repeat, firstDay: '2026-01-01' });
				const to = addDays(from, length);
				const expected: string[] = [];
				for (let date = from; date <= to; date = addDays(date, 1))
					if (repeatsOn(repeat, weekdayOf(date))) expected.push(date);
				expect(routineDays(routine, from, to)).toEqual(expected);
			})
		);
	});

	test('a tick every day makes each day once, in order, and never one in the past', () => {
		fc.assert(
			fc.property(repeats, day, fc.integer({ min: 1, max: 40 }), (repeat, start, ticks) => {
				let routine = lunch({ repeat, firstDay: start });
				const all: string[] = [];
				for (let n = 0; n < ticks; n++) {
					const today = addDays(start, n);
					if (!needsMaking(routine, today)) continue;
					const days = daysToMake(routine, today);
					for (const date of days) expect(date >= today).toBe(true);
					all.push(...days);
					routine = { ...routine, through: horizon(today) };
				}
				expect(all).toEqual([...new Set(all)].sort());
				expect(all).toEqual(routineDays(routine, start, routine.through!));
			})
		);
	});
});

describe('timezones and daylight saving', () => {
	// The same instant is a different day in these zones, and each of them changes its clock in the window below
	const ZONES = [
		// Clocks go back on 2026-10-25
		'Europe/Berlin',
		// Clocks go back on 2026-11-01
		'America/New_York',
		// Clocks go forward on 2026-09-27
		'Pacific/Auckland',
		// A half hour change on 2026-10-04
		'Australia/Lord_Howe',
		'Pacific/Kiritimati',
		'Pacific/Pago_Pago'
	];

	/** A device that is open at 12:00 UTC every day for 60 days: what each tick makes, per zone. */
	const run = (timezone: string, repeat: Repeat, startTime: number, start = '2026-09-20') => {
		let routine = lunch({ repeat, startTime, firstDay: '2026-01-01' });
		const tasks: { date: string; startTime: number }[] = [];
		for (let n = 0; n < 60; n++) {
			const now = new Date(Date.parse(`${start}T12:00:00Z`) + n * 86_400_000);
			const today = todayIn(timezone, now);
			if (!needsMaking(routine, today)) continue;
			for (const date of daysToMake(routine, today)) {
				const task = routineTask(routine, date);
				tasks.push({ date: task.date, startTime: task.startTime });
			}
			routine = { ...routine, through: horizon(today) };
		}
		return tasks;
	};

	test.each(ZONES)('a daily routine has one task on every day in %s', (timezone) => {
		const tasks = run(timezone, 'daily', 720);
		const dates = tasks.map((task) => task.date);
		expect(new Set(dates).size).toBe(dates.length);
		for (let i = 1; i < dates.length; i++) expect(dates[i]).toBe(addDays(dates[i - 1], 1));
	});

	test.each(ZONES)('the task keeps its clock time across the change in %s', (timezone) => {
		// 02:30 does not exist on a day the clocks go forward, the task still says 02:30 and the clock decides
		for (const startTime of [150, 720, 1380])
			for (const task of run(timezone, 'daily', startTime)) expect(task.startTime).toBe(startTime);
	});

	test.each(ZONES)('weekdays have no weekend task in %s', (timezone) => {
		for (const task of run(timezone, 'weekdays', 540))
			expect([0, 6]).not.toContain(weekdayOf(task.date));
	});

	test('a device ahead of another makes its days earlier, each by its own today', () => {
		const ahead = run('Pacific/Kiritimati', 'daily', 720)[0].date;
		const behind = run('Pacific/Pago_Pago', 'daily', 720)[0].date;
		// Kiritimati is UTC+14, Pago Pago UTC-11: at 12:00 UTC it is the same date minus a day at most
		expect(ahead >= behind).toBe(true);
		expect(addDays(behind, 1) >= ahead).toBe(true);
	});

	test('the days after the change are made without a gap or a double', () => {
		const dates = run('Europe/Berlin', 'daily', 720).map((task) => task.date);
		for (const date of ['2026-10-24', '2026-10-25', '2026-10-26'])
			expect(dates.filter((made) => made === date)).toHaveLength(1);
	});
});
