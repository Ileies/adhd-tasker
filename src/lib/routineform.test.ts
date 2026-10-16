/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Routine } from '#lib/core/repo.js';
import {
	checkRoutineForm,
	newRoutineForm,
	routineChanges,
	routineFields,
	routineForm,
	routineLine,
	routineOf
} from '#lib/routineform.js';
import { Priority } from '#lib/types.js';

const TODAY = '2026-10-14';

const routine: Routine = {
	id: 3,
	title: 'Lunch',
	description: '',
	priority: Priority.Medium,
	startTime: 720,
	duration: 45,
	shift: 60,
	kind: 'block',
	repeat: 'weekdays',
	firstDay: '2026-10-01',
	lastDay: null,
	through: '2026-10-27'
};

describe('newRoutineForm', () => {
	test('starts today, every day, and is not ready until it has a title', () => {
		const form = newRoutineForm(TODAY);
		expect(routineFields({ ...form, title: 'Meds' })).toMatchObject({
			repeat: 'daily',
			firstDay: TODAY,
			lastDay: null,
			kind: 'block'
		});
		expect(checkRoutineForm(form)).toBe('Give the routine a title');
	});
});

describe('routineForm and routineFields', () => {
	test('a routine goes into the form and comes out the same', () => {
		expect(routineFields(routineForm(routine))).toEqual({
			title: 'Lunch',
			description: '',
			priority: Priority.Medium,
			startTime: 720,
			duration: 45,
			shift: 60,
			kind: 'block',
			repeat: 'weekdays',
			firstDay: '2026-10-01',
			lastDay: null
		});
	});

	test('a chosen set of days is the normalized repeat', () => {
		const form = routineForm(routine);
		expect(routineFields({ ...form, days: [1, 3] }).repeat).toBe('days:1,3');
		expect(routineFields({ ...form, days: [0, 1, 2, 3, 4, 5, 6] }).repeat).toBe('daily');
	});

	test('an appointment does not move, the title is trimmed', () => {
		const fields = routineFields({
			...routineForm(routine),
			title: '  Lecture ',
			kind: 'appointment'
		});
		expect(fields).toMatchObject({ title: 'Lecture', shift: 0 });
	});
});

describe('checkRoutineForm', () => {
	const form = routineForm(routine);

	test('a good form has nothing wrong', () => {
		expect(checkRoutineForm(form)).toBeNull();
	});

	test.each([
		['a blank title', { title: '  ' }, 'Give the routine a title'],
		['no day', { days: [] }, 'Pick at least one day'],
		[
			'a task that runs past midnight',
			{ startTime: 1430 },
			'Too long: a task has to end by midnight'
		],
		[
			'a last day before the first',
			{ lastDay: '2026-09-30' },
			'The last day is before the first day'
		]
	])('%s', (_name, change, message) => {
		expect(checkRoutineForm({ ...form, ...change })).toBe(message);
	});
});

describe('routineChanges', () => {
	test('nothing changed is nothing to send', () => {
		expect(routineChanges(routine, routineForm(routine))).toEqual({});
	});

	test('names only what differs, a new set of days as its repeat', () => {
		const form = { ...routineForm(routine), startTime: 750, days: [1, 3] };
		expect(routineChanges(routine, form)).toEqual({ startTime: 750, repeat: 'days:1,3' });
	});
});

describe('routineLine and routineOf', () => {
	test('says when it repeats and when it is', () => {
		expect(routineLine(routine)).toBe('Monday to Friday, 12:00 to 12:45');
	});

	test('a task finds its routine, a task of its own or of a removed routine has none', () => {
		expect(routineOf({ routineId: 3 }, [routine])).toBe(routine);
		expect(routineOf({ routineId: null }, [routine])).toBeNull();
		expect(routineOf({ routineId: 9 }, [routine])).toBeNull();
	});
});
