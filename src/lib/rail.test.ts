/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	doneLine,
	doneToday,
	laterLine,
	missedLine,
	alarmLines,
	nextItems,
	noteLine,
	timeRange,
	todosDoneBetween
} from '#lib/rail.js';
import { TaskStatus } from '#lib/types.js';
import { zonedToEpoch } from '#lib/time.js';

const TZ = 'Europe/Berlin';
const at = (date: string, minutes: number) => zonedToEpoch(date, minutes, TZ);

describe('nextItems', () => {
	const TODAY = '2026-10-14';
	const NOW = 10 * 60;
	const task = (startTime: number) => ({ startTime });
	const due = (
		patch: Partial<{ status: string; dueDate: string | null; dueTime: number | null }>
	) => ({
		status: 'open',
		dueDate: TODAY,
		dueTime: 15 * 60,
		...patch
	});
	const times = (items: ReturnType<typeof nextItems>) =>
		items.map((item) => `${item.kind}@${item.at}`);

	test('a to-do due today at a time still ahead is next at that time', () => {
		expect(times(nextItems([task(14 * 60), task(16 * 60)], [due({})], TODAY, NOW))).toEqual([
			'task@840',
			'todo@900',
			'task@960'
		]);
	});

	test('a task comes before a to-do due at the same minute', () => {
		expect(times(nextItems([task(15 * 60)], [due({})], TODAY, NOW))).toEqual([
			'task@900',
			'todo@900'
		]);
	});

	test.each([
		['without a time', { dueTime: null }],
		['whose time has passed', { dueTime: 9 * 60 }],
		['due right now', { dueTime: NOW }],
		['due another day', { dueDate: '2026-10-15' }],
		['without a date', { dueDate: null, dueTime: null }],
		['already done', { status: 'done' }],
		['dropped', { status: 'dropped' }]
	])('a to-do %s never queues', (_name, patch) => {
		expect(nextItems([], [due(patch)], TODAY, NOW)).toEqual([]);
	});

	test('with no to-dos it is the tasks as before', () => {
		expect(times(nextItems([task(11 * 60), task(12 * 60)], [], TODAY, NOW))).toEqual([
			'task@660',
			'task@720'
		]);
	});
});

describe('doneToday', () => {
	test('counts only completed tasks of today', () => {
		const tasks = [
			{ date: '2026-10-15', status: TaskStatus.Completed },
			{ date: '2026-10-15', status: TaskStatus.Pending },
			{ date: '2026-10-14', status: TaskStatus.Completed }
		];
		expect(doneToday(tasks, '2026-10-15')).toBe(1);
	});
});

describe('todosDoneBetween', () => {
	const from = at('2026-10-15', 0);
	const to = at('2026-10-16', 0);

	test('counts the to-dos finished within the day, start inclusive and end exclusive', () => {
		const todos = [
			{ status: 'done', completedAt: from },
			{ status: 'done', completedAt: from + 60_000 },
			{ status: 'done', completedAt: to },
			{ status: 'done', completedAt: from - 1 }
		];
		expect(todosDoneBetween(todos, from, to)).toBe(2);
	});

	test('ignores to-dos that are open, dropped or have no finishing time', () => {
		const todos = [
			{ status: 'open', completedAt: from + 1 },
			{ status: 'dropped', completedAt: from + 1 },
			{ status: 'done', completedAt: null }
		];
		expect(todosDoneBetween(todos, from, to)).toBe(0);
	});
});

describe('doneLine', () => {
	test.each([
		[0, null],
		[1, '1 done today'],
		[3, '3 done today']
	])('%d gives %p', (count, line) => {
		expect(doneLine(count)).toBe(line);
	});
});

describe('timeRange', () => {
	test('shows start and end', () => {
		expect(timeRange({ startTime: 900, duration: 15 })).toBe('15:00 - 15:15');
	});
});

describe('alarmLines', () => {
	const now = at('2026-10-15', 14 * 60);

	test('lists the alarms still to ring today in time order', () => {
		const alarms = [
			{ fireAt: at('2026-10-15', 17 * 60), label: 'Dinner' },
			{ fireAt: at('2026-10-15', 15 * 60 + 40), label: 'Leave' }
		];
		expect(alarmLines(alarms, now, '2026-10-15', TZ)).toEqual([
			'Alarm 15:40 Leave',
			'Alarm 17:00 Dinner'
		]);
	});

	test('skips alarms that rang, are off, or are on other days', () => {
		const alarms = [
			{ fireAt: at('2026-10-15', 13 * 60), label: 'Past' },
			{ fireAt: at('2026-10-15', 16 * 60), label: 'Off', enabled: false },
			{ fireAt: at('2026-10-16', 8 * 60), label: 'Tomorrow' }
		];
		expect(alarmLines(alarms, now, '2026-10-15', TZ)).toEqual([]);
	});

	test('an alarm without a label shows only the time', () => {
		const alarms = [{ fireAt: at('2026-10-15', 16 * 60), label: '' }];
		expect(alarmLines(alarms, now, '2026-10-15', TZ)).toEqual(['Alarm 16:00']);
	});

	test('shows at most four lines', () => {
		const alarms = [1, 2, 3, 4, 5].map((n) => ({
			fireAt: at('2026-10-15', 14 * 60 + n * 5),
			label: 'Timer'
		}));
		expect(alarmLines(alarms, now, '2026-10-15', TZ)).toHaveLength(4);
	});
});

describe('lines', () => {
	test('later line hides at zero', () => {
		expect(laterLine(0)).toBeNull();
		expect(laterLine(3)).toBe('+3 later today');
	});

	test('missed line counts decisions', () => {
		expect(missedLine(0)).toBeNull();
		expect(missedLine(1)).toBe('1 task needs a decision');
		expect(missedLine(2)).toBe('2 tasks need a decision');
	});

	test('note line counts assistant notes', () => {
		expect(noteLine(0)).toBeNull();
		expect(noteLine(1)).toBe('1 assistant note');
		expect(noteLine(2)).toBe('2 assistant notes');
	});
});
