/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	doneLine,
	doneToday,
	laterLine,
	missedLine,
	nextAlarmLine,
	noteLine,
	timeRange
} from '#lib/rail.js';
import { TaskStatus } from '#lib/types.js';
import { zonedToEpoch } from '#lib/time.js';

const TZ = 'Europe/Berlin';
const at = (date: string, minutes: number) => zonedToEpoch(date, minutes, TZ);

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

describe('nextAlarmLine', () => {
	const now = at('2026-10-15', 14 * 60);

	test('names the first alarm still to ring today', () => {
		const alarms = [
			{ fireAt: at('2026-10-15', 17 * 60), label: 'Dinner' },
			{ fireAt: at('2026-10-15', 15 * 60 + 40), label: 'Leave' }
		];
		expect(nextAlarmLine(alarms, now, '2026-10-15', TZ)).toBe('Alarm 15:40 Leave');
	});

	test('skips alarms that rang and alarms on other days', () => {
		const alarms = [
			{ fireAt: at('2026-10-15', 13 * 60), label: 'Past' },
			{ fireAt: at('2026-10-16', 8 * 60), label: 'Tomorrow' }
		];
		expect(nextAlarmLine(alarms, now, '2026-10-15', TZ)).toBeNull();
	});

	test('an alarm without a label shows only the time', () => {
		const alarms = [{ fireAt: at('2026-10-15', 16 * 60), label: '' }];
		expect(nextAlarmLine(alarms, now, '2026-10-15', TZ)).toBe('Alarm 16:00');
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
