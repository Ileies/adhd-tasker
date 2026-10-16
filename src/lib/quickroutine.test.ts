/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { takeRepeat } from '#lib/quickalarm.js';
import { quickRoutine, quickRoutinePreview } from '#lib/quickroutine.js';

// A Wednesday
const TODAY = '2026-10-14';

describe('quickRoutine', () => {
	test.each([
		['Lunch 12:00 45m daily', { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily' }],
		['Meds 8:00 weekdays', { title: 'Meds', startTime: 480, duration: 30, repeat: 'weekdays' }],
		['Walk 6pm every day', { title: 'Walk', startTime: 1080, duration: 30, repeat: 'daily' }],
		[
			'Gym 18:00 1h every tue and thu',
			{ title: 'Gym', startTime: 1080, duration: 60, repeat: 'days:2,4' }
		],
		['Plan 9:00 every friday', { title: 'Plan', startTime: 540, duration: 30, repeat: 'days:5' }],
		['Standup 9:30 mon-fri', { title: 'Standup', startTime: 570, duration: 30, repeat: 'weekdays' }]
	])('%s', (text, expected) => {
		expect(quickRoutine(text, TODAY)).toMatchObject({
			...expected,
			firstDay: TODAY,
			kind: 'block'
		});
	});

	test.each([
		['a line without a repeat word', 'Lunch 12:00 45m'],
		['a repeat word without a time', 'Meds daily'],
		['a repeat word without a title', '8:00 daily'],
		['a bare weekday, which is a day', 'Dentist friday 14:30'],
		['an empty line', '']
	])('%s is no routine', (_name, text) => {
		expect(quickRoutine(text, TODAY)).toBeNull();
	});

	test('a day in the line is the first day', () => {
		expect(quickRoutine('Meds 8:00 daily from tomorrow', TODAY)).toMatchObject({
			title: 'Meds',
			firstDay: '2026-10-15'
		});
	});

	test('the words of an appointment make a repeating appointment, the chip decides otherwise', () => {
		expect(quickRoutine('Lecture 10:00 weekdays', TODAY)?.kind).toBe('appointment');
		expect(quickRoutine('Lecture 10:00 weekdays', TODAY, 'block')?.kind).toBe('block');
		expect(quickRoutine('Lunch 12:00 daily', TODAY, 'appointment')?.kind).toBe('appointment');
	});

	test('never crosses midnight', () => {
		expect(quickRoutine('Bed 23:50 1h daily', TODAY)).toMatchObject({
			startTime: 1380,
			duration: 60
		});
	});
});

describe('takeRepeat', () => {
	test('a bare day is a repeat only when asked for', () => {
		expect(takeRepeat('Run Sat', true).repeat).toBe('days:6');
		expect(takeRepeat('Run Sat', false)).toEqual({ repeat: 'none', rest: 'Run Sat' });
	});
});

describe('quickRoutinePreview', () => {
	test('says what the line makes', () => {
		expect(quickRoutinePreview('Lunch 12:00 45m daily', TODAY)).toBe(
			'Routine: Every day, 12:00 to 12:45, 45m'
		);
	});

	test('names a later first day and a repeating appointment', () => {
		const preview = quickRoutinePreview('Lecture 10:00 1h weekdays from tomorrow', TODAY);
		expect(preview).toContain('Repeating appointment: Monday to Friday, from ');
		expect(preview).toContain('10:00 to 11:00');
	});

	test('is null for a line that is no routine', () => {
		expect(quickRoutinePreview('Lunch 12:00', TODAY)).toBeNull();
	});
});
