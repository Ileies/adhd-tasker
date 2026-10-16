/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { newRoutineOf, parseRoutineId, parseRoutineInput } from '#lib/routine-input.js';
import { Priority } from '#lib/types.js';

const lunch = { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily' };

describe('parseRoutineInput', () => {
	test('a title, a start, a duration and a repeat make a routine', () => {
		expect(parseRoutineInput(lunch, 'create')).toEqual({
			ok: true,
			value: { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily' }
		});
	});

	test('every field is read and trimmed to its rules', () => {
		const result = parseRoutineInput(
			{
				...lunch,
				title: '  Lunch  ',
				description: 'with the team',
				priority: 3,
				shift: 60,
				kind: 'appointment',
				repeat: 'days:1,3',
				firstDay: '2026-10-14',
				lastDay: '2026-12-31'
			},
			'create'
		);
		expect(result).toEqual({
			ok: true,
			value: {
				title: 'Lunch',
				description: 'with the team',
				priority: 3,
				startTime: 720,
				duration: 45,
				shift: 60,
				kind: 'appointment',
				repeat: 'days:1,3',
				firstDay: '2026-10-14',
				lastDay: '2026-12-31'
			}
		});
	});

	test('what only the rules write is ignored', () => {
		const result = parseRoutineInput(
			{ ...lunch, id: 4, through: '2026-10-30', email: 'x' },
			'create'
		);
		expect(result.ok && Object.keys(result.value).sort()).toEqual([
			'duration',
			'repeat',
			'startTime',
			'title'
		]);
	});

	test.each([
		['a title', { ...lunch, title: undefined }],
		['an empty title', { ...lunch, title: '   ' }],
		['a start', { ...lunch, startTime: undefined }],
		['a duration', { ...lunch, duration: undefined }],
		['a repeat', { ...lunch, repeat: undefined }]
	])('creating needs %s', (_name, body) => {
		expect(parseRoutineInput(body, 'create').ok).toBe(false);
	});

	test.each([
		['a repeat that happens once', { repeat: 'none' }],
		['a repeat that is not one', { repeat: 'sometimes' }],
		['an unsorted list of days', { repeat: 'days:3,1' }],
		['every day written as a list', { repeat: 'days:0,1,2,3,4,5,6' }],
		['a start of 24:00', { startTime: 1440 }],
		['a fractional start', { startTime: 720.5 }],
		['a start that is text', { startTime: '12:00' }],
		['a duration under 5 minutes', { duration: 4 }],
		['a priority of 6', { priority: 6 }],
		['a shift above the limit', { shift: 241 }],
		['a fractional shift', { shift: 1.5 }],
		['the kind travel', { kind: 'travel' }],
		['a first day that is not a date', { firstDay: 'today' }],
		['a last day that is not a date', { lastDay: 'never' }],
		['a last day before the first', { firstDay: '2026-10-14', lastDay: '2026-10-13' }],
		['a time across midnight', { startTime: 1400, duration: 100 }],
		['a description that is not text', { description: 4 }]
	])('refuses %s', (_name, patch) => {
		expect(parseRoutineInput({ ...lunch, ...patch }, 'create').ok).toBe(false);
	});

	test('an open end is null', () => {
		expect(parseRoutineInput({ lastDay: null }, 'update')).toEqual({
			ok: true,
			value: { lastDay: null }
		});
	});

	test('an update takes any subset and refuses an empty one', () => {
		expect(parseRoutineInput({ startTime: 750 }, 'update')).toEqual({
			ok: true,
			value: { startTime: 750 }
		});
		expect(parseRoutineInput({}, 'update').ok).toBe(false);
		expect(parseRoutineInput({ id: 3 }, 'update').ok).toBe(false);
	});

	test('anything that is not an object is refused', () => {
		expect(parseRoutineInput(null, 'create').ok).toBe(false);
		expect(parseRoutineInput('Lunch', 'create').ok).toBe(false);
	});
});

describe('parseRoutineId', () => {
	test('needs a whole number from 1', () => {
		expect(parseRoutineId(7)).toBe(7);
		expect(parseRoutineId(0)).toBeUndefined();
		expect(parseRoutineId(7.5)).toBeUndefined();
		expect(parseRoutineId('7')).toBeUndefined();
	});
});

describe('newRoutineOf', () => {
	test('starts today with a medium priority unless it says otherwise', () => {
		const parsed = parseRoutineInput(lunch, 'create');
		const routine = parsed.ok && newRoutineOf(parsed.value, '2026-10-14');
		expect(routine).toMatchObject({ firstDay: '2026-10-14', priority: Priority.Medium });
	});

	test('keeps the first day and priority it was given', () => {
		const parsed = parseRoutineInput({ ...lunch, firstDay: '2026-11-01', priority: 4 }, 'create');
		const routine = parsed.ok && newRoutineOf(parsed.value, '2026-10-14');
		expect(routine).toMatchObject({ firstDay: '2026-11-01', priority: 4 });
	});
});
