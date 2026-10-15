/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	STUCK_REASONS,
	findStuckReason,
	hyperfocusDue,
	momentKey,
	reminderDue
} from '#lib/anchoring.js';
import { parseAlarm } from '#lib/schedule.js';
import { Priority, TaskStatus } from '#lib/types.js';

const task = (id: number, startTime: number, duration: number) => ({
	id,
	title: `Task ${id}`,
	startTime,
	duration,
	priority: Priority.Medium,
	status: TaskStatus.Pending
});

describe('findStuckReason', () => {
	test('knows the options and nothing else', () => {
		expect(findStuckReason('too-big')?.label).toBe('It feels too big');
		expect(findStuckReason('nope')).toBeUndefined();
		expect(findStuckReason(3)).toBeUndefined();
	});
});

describe('hyperfocusDue', () => {
	const missed = [task(1, 540, 60)]; // ended 600
	test('is quiet before the threshold', () => {
		expect(hyperfocusDue(missed, 610, 15)).toBeNull();
	});
	test('fires when the threshold is crossed', () => {
		expect(hyperfocusDue(missed, 615, 15)?.id).toBe(1);
		expect(hyperfocusDue(missed, 618, 15)?.id).toBe(1);
	});
	test('is history after a few minutes, so a reload stays quiet', () => {
		expect(hyperfocusDue(missed, 620, 15)).toBeNull();
		expect(hyperfocusDue(missed, 900, 15)).toBeNull();
	});
	test('follows the configured minutes', () => {
		expect(hyperfocusDue(missed, 630, 30)?.id).toBe(1);
	});
	test('needs a missed task', () => {
		expect(hyperfocusDue([], 700, 15)).toBeNull();
	});
});

describe('reminderDue', () => {
	const upcoming = [task(2, 600, 30), task(3, 700, 30)];
	test('finds a task starting within the advance time', () => {
		expect(reminderDue(upcoming, 590, 15)?.id).toBe(2);
		expect(reminderDue(upcoming, 585, 15)?.id).toBe(2);
	});
	test('waits until the window opens', () => {
		expect(reminderDue(upcoming, 580, 15)).toBeNull();
	});
	test('ignores tasks that already started', () => {
		expect(reminderDue(upcoming, 600, 15)).toBeNull();
	});
});

describe('momentKey', () => {
	test('differs per kind, day and task time', () => {
		const a = task(1, 540, 60);
		expect(momentKey('overrun', '2026-10-14', a)).not.toBe(momentKey('reminder', '2026-10-14', a));
		expect(momentKey('wrap-up', '2026-10-14', a)).not.toBe(momentKey('reminder', '2026-10-14', a));
		expect(momentKey('overrun', '2026-10-14', a)).not.toBe(momentKey('overrun', '2026-10-15', a));
		expect(momentKey('overrun', '2026-10-14', a)).not.toBe(
			momentKey('overrun', '2026-10-14', { ...a, duration: 75 })
		);
	});
});

describe('STUCK_REASONS', () => {
	test.each(STUCK_REASONS.map((reason) => [reason.id, reason.action] as const))(
		'%s has a timer the schedule accepts',
		(_id, action) => {
			const parsed = parseAlarm(
				{ in_minutes: action.minutes, label: action.alarm, tone: 'soft' },
				Date.UTC(2026, 9, 14, 10),
				'UTC'
			);
			expect(parsed.ok).toBe(true);
			expect(action.label).toContain(`${action.minutes} min`);
		}
	);

	test('every reason has its own id', () => {
		expect(new Set(STUCK_REASONS.map((reason) => reason.id)).size).toBe(STUCK_REASONS.length);
	});
});
