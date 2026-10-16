/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	MIN_TRAVEL_MINUTES,
	moveTravel,
	needsPrep,
	prepDue,
	prepOf,
	prepTitle,
	removedLine,
	shiftDue,
	travelLine,
	travelOf,
	travelPlacement,
	travelTitle
} from '#lib/prep.js';
import { TaskStatus } from '#lib/types.js';

const exam = { date: '2026-11-05', startTime: 12 * 60 };

describe('travelPlacement', () => {
	test('travel ends the arrive early minutes before the appointment', () => {
		expect(travelPlacement(exam, 45, 10)).toEqual({
			date: '2026-11-05',
			startTime: 11 * 60 + 5,
			duration: 45
		});
	});

	test('arriving on the dot ends travel when the appointment starts', () => {
		expect(travelPlacement(exam, 30, 0)).toEqual({
			date: '2026-11-05',
			startTime: 11 * 60 + 30,
			duration: 30
		});
	});

	test('travel that would start the day before is cut short at midnight', () => {
		expect(travelPlacement({ date: '2026-11-05', startTime: 30 }, 60, 10)).toEqual({
			date: '2026-11-05',
			startTime: 0,
			duration: 20
		});
	});

	test('nothing is placed when less than the minimum fits', () => {
		const tooLittle = MIN_TRAVEL_MINUTES - 1;
		expect(travelPlacement({ date: '2026-11-05', startTime: 10 + tooLittle }, 60, 10)).toBeNull();
	});
});

describe('moveTravel', () => {
	const travel = { date: '2026-11-05', startTime: 11 * 60 + 5, duration: 45 };

	test('travel keeps its gap and its length when the appointment moves later in the day', () => {
		expect(moveTravel(travel, exam, { date: '2026-11-05', startTime: 14 * 60 })).toEqual({
			date: '2026-11-05',
			startTime: 13 * 60 + 5,
			duration: 45
		});
	});

	test('travel follows the appointment to another day', () => {
		expect(moveTravel(travel, exam, { date: '2026-11-06', startTime: 12 * 60 })).toEqual({
			date: '2026-11-06',
			startTime: 11 * 60 + 5,
			duration: 45
		});
	});

	test('travel is cut short when it would run into the day before', () => {
		expect(moveTravel(travel, exam, { date: '2026-11-05', startTime: 40 })).toEqual({
			date: '2026-11-05',
			startTime: 0,
			duration: 30
		});
	});

	test('travel is gone when nothing is left of it', () => {
		expect(moveTravel(travel, exam, { date: '2026-11-05', startTime: 12 })).toBeNull();
	});
});

describe('prepDue', () => {
	test('a prep to-do is due when the travel starts', () => {
		expect(prepDue(exam, { date: '2026-11-05', startTime: 11 * 60 + 5 })).toEqual({
			dueDate: '2026-11-05',
			dueTime: 11 * 60 + 5
		});
	});

	test('without travel it is due when the appointment starts', () => {
		expect(prepDue(exam, null)).toEqual({ dueDate: '2026-11-05', dueTime: 12 * 60 });
	});
});

describe('shiftDue', () => {
	const before = exam;

	test('a due date moves by the days the appointment moved', () => {
		expect(
			shiftDue({ dueDate: '2026-11-04', dueTime: null }, before, {
				date: '2026-11-06',
				startTime: 12 * 60
			})
		).toEqual({ dueDate: '2026-11-05', dueTime: null });
	});

	test('a due time moves by the minutes the appointment moved', () => {
		expect(
			shiftDue({ dueDate: '2026-11-05', dueTime: 11 * 60 + 5 }, before, {
				date: '2026-11-05',
				startTime: 14 * 60
			})
		).toEqual({ dueDate: '2026-11-05', dueTime: 13 * 60 + 5 });
	});

	test('a due time that runs past midnight lands on the next day', () => {
		expect(
			shiftDue({ dueDate: '2026-11-05', dueTime: 23 * 60 }, before, {
				date: '2026-11-05',
				startTime: 14 * 60
			})
		).toEqual({ dueDate: '2026-11-06', dueTime: 60 });
	});

	test('a due time that runs before midnight lands on the day before', () => {
		expect(
			shiftDue({ dueDate: '2026-11-05', dueTime: 30 }, before, {
				date: '2026-11-05',
				startTime: 11 * 60
			})
		).toEqual({ dueDate: '2026-11-04', dueTime: 23 * 60 + 30 });
	});

	test('a to-do without a due date has nothing to follow', () => {
		const due = { dueDate: null, dueTime: null };
		expect(shiftDue(due, before, { date: '2026-11-06', startTime: 0 })).toEqual(due);
	});
});

describe('lines and lookups', () => {
	test('the titles name the appointment', () => {
		expect(travelTitle('Exam Math')).toBe('Travel to Exam Math');
		expect(prepTitle('Exam Math')).toBe('Prepare: Exam Math');
	});

	test('a to-do whose appointment was deleted says what it was for', () => {
		expect(removedLine('Exam Math')).toBe('Exam Math was removed');
	});

	test('the travel line gives its times', () => {
		expect(
			travelLine({ title: 'Travel to Exam Math', date: '', startTime: 11 * 60 + 5, duration: 45 })
		).toBe('Travel to Exam Math, 11:05 to 11:50');
	});

	test('the prep and the travel of an appointment are found by its id', () => {
		const todos = [
			{ id: 1, parentId: 7 },
			{ id: 2, parentId: null },
			{ id: 3, parentId: 8 }
		];
		const tasks = [
			{ id: 10, kind: 'block' as const, parentId: null },
			{ id: 11, kind: 'travel' as const, parentId: 7 }
		];
		expect(prepOf(todos, 7).map((todo) => todo.id)).toEqual([1]);
		expect(travelOf(tasks, 7)?.id).toBe(11);
		expect(travelOf(tasks, 8)).toBeUndefined();
	});
});

describe('needsPrep', () => {
	const appointment = {
		id: 7,
		kind: 'appointment' as const,
		date: '2026-11-05',
		status: TaskStatus.Pending
	};

	test('an appointment within two weeks without preparation needs it', () => {
		expect(needsPrep(appointment, [], '2026-10-30')).toBe(true);
	});

	test('one that has a prep to-do does not', () => {
		expect(needsPrep(appointment, [{ parentId: 7 }], '2026-10-30')).toBe(false);
	});

	test.each([
		['a task of the user', { ...appointment, kind: 'block' as const }, '2026-10-30'],
		['travel', { ...appointment, kind: 'travel' as const }, '2026-10-30'],
		['an appointment that is done', { ...appointment, status: TaskStatus.Completed }, '2026-10-30'],
		['an appointment that is more than two weeks away', appointment, '2026-10-16'],
		['an appointment that already passed', appointment, '2026-11-06']
	])('%s does not', (_name, task, today) => {
		expect(needsPrep(task, [], today)).toBe(false);
	});
});
