/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { parseAddTask, parseDeleteTask, parseListTasks, parseUpdateTask } from './assistant-tools';

describe('parseAddTask', () => {
	test('reads HH:MM and applies defaults', () => {
		const result = parseAddTask({ title: ' Dinner ', date: '2026-10-14', start: '19:30' });
		expect(result).toEqual({
			ok: true,
			value: { title: 'Dinner', description: '', date: '2026-10-14', startTime: 1170, duration: 30, priority: 2 }
		});
	});

	test('rejects bad input', () => {
		expect(parseAddTask({ title: '', date: '2026-10-14', start: '19:30' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: 'tomorrow', start: '19:30' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '25:00' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '19:30', priority: 9 }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '19:30', duration_minutes: 2 }).ok).toBe(false);
	});

	test('rejects tasks that cross midnight', () => {
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '23:30', duration_minutes: 60 }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '23:30', duration_minutes: 30 }).ok).toBe(true);
	});
});

describe('parseUpdateTask', () => {
	test('only the given fields end up in the patch', () => {
		expect(parseUpdateTask({ id: 4, start: '09:15', status: 'completed' })).toEqual({
			ok: true,
			value: { id: 4, patch: { startTime: 555, status: 'completed' } }
		});
	});

	test('needs an id and at least one change', () => {
		expect(parseUpdateTask({ start: '09:15' }).ok).toBe(false);
		expect(parseUpdateTask({ id: 4 }).ok).toBe(false);
		expect(parseUpdateTask({ id: 4, status: 'active' }).ok).toBe(false);
	});
});

describe('parseListTasks and parseDeleteTask', () => {
	test('range defaults to one day and is capped', () => {
		expect(parseListTasks({ from: '2026-10-14' })).toEqual({ ok: true, value: { from: '2026-10-14', to: '2026-10-14' } });
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-27' }).ok).toBe(true);
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-28' }).ok).toBe(false);
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-13' }).ok).toBe(false);
	});

	test('delete needs an integer id', () => {
		expect(parseDeleteTask({ id: 3 }).ok).toBe(true);
		expect(parseDeleteTask({ id: '3' }).ok).toBe(false);
	});
});
