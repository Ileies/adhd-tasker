/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Alarm } from '#lib/app.svelte.js';
import {
	QUICK_TIMERS,
	groupAlarms,
	restoreFields,
	timerFields,
	toneLabel
} from '#lib/alarmview.js';

const alarm = (fireAt: number, extra: Partial<Alarm> = {}): Alarm => ({
	id: 1,
	fireAt,
	label: 'Leave',
	tone: 'wake',
	repeat: 'none',
	durationMin: 5,
	createdBy: 'user',
	...extra
});

const now = Date.parse('2026-10-15T12:00:00Z');

describe('quick timers', () => {
	test('offer 5, 10, 25 minutes and an hour', () => {
		expect(QUICK_TIMERS.map((t) => t.minutes)).toEqual([5, 10, 25, 60]);
	});

	test('a timer is a one-off alarm labeled Timer', () => {
		expect(timerFields(25)).toMatchObject({ in_minutes: 25, label: 'Timer', repeat: 'none' });
	});
});

describe('groupAlarms', () => {
	test('today and later, each in time order', () => {
		const late = alarm(now + 3 * 3_600_000, { id: 1 });
		const soon = alarm(now + 3_600_000, { id: 2 });
		const tomorrow = alarm(now + 26 * 3_600_000, { id: 3 });
		const { today, later } = groupAlarms([late, tomorrow, soon], now, 'UTC');
		expect(today.map((a) => a.id)).toEqual([2, 1]);
		expect(later.map((a) => a.id)).toEqual([3]);
	});

	test('today is the day in the user timezone', () => {
		const { today } = groupAlarms([alarm(Date.parse('2026-10-15T20:00:00Z'))], now, 'Asia/Tokyo');
		expect(today).toHaveLength(0);
	});
});

describe('restoreFields', () => {
	test('a one-off comes back as minutes from now, at least one', () => {
		expect(restoreFields(alarm(now + 10 * 60_000), now, 'UTC')).toMatchObject({
			in_minutes: 10,
			repeat: 'none'
		});
		expect(restoreFields(alarm(now + 1000), now, 'UTC')).toMatchObject({ in_minutes: 1 });
	});

	test('a repeating alarm comes back at its clock time in the user timezone', () => {
		const fields = restoreFields(
			alarm(Date.parse('2026-10-16T07:30:00Z'), { repeat: 'daily' }),
			now,
			'UTC'
		);
		expect(fields).toMatchObject({ at: '07:30', repeat: 'daily', duration_minutes: 5 });
		expect(fields.in_minutes).toBeUndefined();
	});

	test('a custom tone falls back to the chime', () => {
		const custom = { wave: 'sine', notes: [] } as unknown as Alarm['tone'];
		expect(restoreFields(alarm(now + 60_000, { tone: custom }), now, 'UTC').tone).toBe('chime');
	});
});

describe('toneLabel', () => {
	test('is the name without the description', () => {
		expect(toneLabel('wake')).toBe('Wake');
	});
});
