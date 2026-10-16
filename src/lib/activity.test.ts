/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { datesOfAction, summarizeAction } from '#lib/activity.js';

const task = { title: 'Study', date: '2026-10-14', startTime: 1020, duration: 120 };

describe('summarizeAction', () => {
	test('says what each tool did', () => {
		expect(summarizeAction('add_task', null, task)).toBe('Added Study at 17:00');
		expect(summarizeAction('delete_task', task, null)).toBe('Deleted Study');
		expect(summarizeAction('update_task', { ...task, startTime: 900 }, task)).toBe(
			'Moved Study to 17:00'
		);
		expect(summarizeAction('update_task', { ...task, date: '2026-10-13' }, task)).toBe(
			'Moved Study to 2026-10-14 17:00'
		);
		expect(summarizeAction('update_task', { ...task, duration: 60 }, task)).toBe(
			'Resized Study to 120 min'
		);
		expect(summarizeAction('update_task', { ...task }, { ...task })).toBe('Updated Study');
	});
});

describe('summarizeAction for to-dos and routines', () => {
	const todo = { title: 'Study B', status: 'open', dueDate: '2026-11-05' };
	const routine = { title: 'Meds' };

	test('says what each to-do tool did', () => {
		expect(summarizeAction('add_todo', null, todo)).toBe('Added the to-do Study B');
		expect(summarizeAction('delete_todo', todo, null)).toBe('Deleted the to-do Study B');
		expect(summarizeAction('update_todo', todo, { ...todo, status: 'done' })).toBe(
			'Marked Study B done'
		);
		expect(summarizeAction('update_todo', todo, { ...todo, status: 'dropped' })).toBe(
			'Dropped Study B'
		);
		expect(
			summarizeAction('update_todo', { ...todo, status: 'done' }, { ...todo, status: 'open' })
		).toBe('Reopened Study B');
		expect(summarizeAction('update_todo', todo, { ...todo, dueDate: '2026-11-09' })).toBe(
			'Moved the due date of Study B to 2026-11-09'
		);
		expect(summarizeAction('update_todo', todo, { ...todo, dueDate: null })).toBe(
			'Removed the due date of Study B'
		);
		expect(summarizeAction('update_todo', todo, { ...todo, title: 'Study C' })).toBe(
			'Updated the to-do Study C'
		);
	});

	test('says what each routine tool did', () => {
		expect(summarizeAction('add_routine', null, routine)).toBe('Added the routine Meds');
		expect(summarizeAction('update_routine', routine, routine)).toBe('Changed the routine Meds');
		expect(summarizeAction('delete_routine', routine, null)).toBe('Deleted the routine Meds');
	});

	test('a row without its snapshots still has a line', () => {
		expect(summarizeAction('add_todo', null, null)).toBe('Added a to-do');
		expect(summarizeAction('update_todo', null, null)).toBe('Changed a to-do');
		expect(summarizeAction('delete_todo', null, null)).toBe('Deleted a to-do');
		expect(summarizeAction('add_routine', null, null)).toBe('Added a routine');
		expect(summarizeAction('update_routine', null, null)).toBe('Changed a routine');
		expect(summarizeAction('delete_routine', null, null)).toBe('Deleted a routine');
	});

	test('a to-do or a routine touches no day of the plan', () => {
		expect(datesOfAction(todo, todo)).toEqual([]);
	});
});

describe('datesOfAction', () => {
	test('lists both days of a move once', () => {
		expect(datesOfAction({ ...task, date: '2026-10-13' }, task)).toEqual([
			'2026-10-13',
			'2026-10-14'
		]);
		expect(datesOfAction(task, task)).toEqual(['2026-10-14']);
		expect(datesOfAction(null, null)).toEqual([]);
	});
});
