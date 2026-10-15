/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { sampleDay } from '#lib/core/sample.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { rank } from '#lib/priority.js';
import { TaskStatus } from '#lib/types.js';

const TODAY = '2026-10-14';
const withIds = (now: number) => sampleDay(TODAY, now).map((task, id) => ({ ...task, id }));
const minute = fc.integer({ min: 0, max: DAY_MINUTES - 1 });

describe('sampleDay', () => {
	test('has four or five tasks around midday, all on the given day', () => {
		const tasks = sampleDay(TODAY, 12 * 60 + 7);
		expect(tasks).toHaveLength(5);
		expect(new Set(tasks.map((task) => task.date))).toEqual(new Set([TODAY]));
	});

	test('one task is running at any time of the day', () => {
		fc.assert(
			fc.property(minute, (now) => {
				const tasks = withIds(now);
				const current = rank(tasks, now).current;
				expect(current?.title).toBe('Write the report intro');
			})
		);
	});

	test('no task crosses midnight or starts before it', () => {
		fc.assert(
			fc.property(minute, (now) => {
				for (const task of sampleDay(TODAY, now)) {
					expect(task.startTime).toBeGreaterThanOrEqual(0);
					expect(task.startTime + task.duration).toBeLessThanOrEqual(DAY_MINUTES);
				}
			})
		);
	});

	test('the running task has at least half an hour left, so Now has something to show', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 22 * 60 }), (now) => {
				const running = withIds(now).find((task) => task.title === 'Write the report intro');
				expect(running!.startTime + running!.duration - now).toBeGreaterThanOrEqual(30);
			})
		);
	});

	test('the task before the running one is already done, the others are open', () => {
		const status = Object.fromEntries(
			sampleDay(TODAY, 12 * 60).map((task) => [task.title, task.status])
		);
		expect(status).toEqual({
			'Check the day': TaskStatus.Completed,
			'Write the report intro': TaskStatus.Pending,
			'Reply to messages': TaskStatus.Pending,
			'Take a walk': TaskStatus.Pending,
			'Plan tomorrow': TaskStatus.Pending
		});
	});

	test('late at night only the tasks that fit are left, the running one stays', () => {
		const titles = sampleDay(TODAY, DAY_MINUTES - 5).map((task) => task.title);
		expect(titles).toContain('Write the report intro');
		expect(titles).not.toContain('Plan tomorrow');
	});
});
