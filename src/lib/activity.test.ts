/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { datesOfAction, summarizeAction } from './activity';

const task = { title: 'Study', date: '2026-10-14', startTime: 1020, duration: 120 };

describe('summarizeAction', () => {
	test('says what each tool did', () => {
		expect(summarizeAction('add_task', null, task)).toBe('Added Study at 17:00');
		expect(summarizeAction('delete_task', task, null)).toBe('Deleted Study');
		expect(summarizeAction('update_task', { ...task, startTime: 900 }, task)).toBe('Moved Study to 17:00');
		expect(summarizeAction('update_task', { ...task, date: '2026-10-13' }, task)).toBe('Moved Study to 2026-10-14 17:00');
		expect(summarizeAction('update_task', { ...task, duration: 60 }, task)).toBe('Resized Study to 120 min');
		expect(summarizeAction('update_task', { ...task }, { ...task })).toBe('Updated Study');
	});
});

describe('datesOfAction', () => {
	test('lists both days of a move once', () => {
		expect(datesOfAction({ ...task, date: '2026-10-13' }, task)).toEqual(['2026-10-13', '2026-10-14']);
		expect(datesOfAction(task, task)).toEqual(['2026-10-14']);
		expect(datesOfAction(null, null)).toEqual([]);
	});
});
