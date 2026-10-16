/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { sampleDay, SAMPLE_DAYS } from '#lib/core/sample.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { rank } from '#lib/priority.js';
import { addDays } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

const TODAY = '2026-10-14'; // a Wednesday
const SETUP = 'Set up ADHD Tasker';
const withIds = (now: number) => sampleDay(TODAY, now).map((task, id) => ({ ...task, id }));
const minute = fc.integer({ min: 0, max: DAY_MINUTES - 1 });

describe('sampleDay', () => {
	test('covers today and the six days after it', () => {
		const dates = new Set(sampleDay(TODAY, 12 * 60 + 8).map((task) => task.date));
		expect([...dates].sort()).toEqual(
			Array.from({ length: SAMPLE_DAYS }, (_, index) => addDays(TODAY, index))
		);
	});

	test('a full day: lunch is running at 12:08 and the walk is next', () => {
		const today = withIds(12 * 60 + 8).filter((task) => task.date === TODAY);
		expect(today.length).toBeGreaterThanOrEqual(15);
		const ranked = rank(today, 12 * 60 + 8);
		expect(ranked.current?.title).toBe('Lunch');
	});

	test('the setup task is the next break, once in the whole week', () => {
		const tasks = sampleDay(TODAY, 12 * 60 + 8);
		const setup = tasks.filter((task) => task.title === SETUP);
		expect(setup).toHaveLength(1);
		expect(setup[0]).toMatchObject({ date: TODAY, startTime: 12 * 60 + 45 });
		expect(setup[0].status).toBe(TaskStatus.Pending);
	});

	test('late in the evening the setup moves to the first break of the next day', () => {
		const setup = sampleDay(TODAY, 21 * 60).find((task) => task.title === SETUP);
		expect(setup?.date).toBe(addDays(TODAY, 1));
	});

	test('weekdays have focus blocks, the weekend has none', () => {
		const tasks = sampleDay(TODAY, 12 * 60);
		const focusOn = (date: string) =>
			tasks.filter((task) => task.date === date && task.title.startsWith('Focus')).length;
		expect(focusOn(TODAY)).toBe(3);
		expect(focusOn(addDays(TODAY, 3))).toBe(0); // Saturday
	});

	test('the evening slot before dinner changes with the weekday', () => {
		const evening = sampleDay(TODAY, 12 * 60)
			.filter((task) => task.startTime === 17 * 60)
			.map((task) => task.title);
		expect(new Set(evening).size).toBe(SAMPLE_DAYS);
	});

	test('tasks of a day never overlap and none crosses midnight', () => {
		fc.assert(
			fc.property(minute, (now) => {
				const byDay = Map.groupBy(sampleDay(TODAY, now), (task) => task.date);
				for (const tasks of byDay.values()) {
					const sorted = tasks.toSorted((a, b) => a.startTime - b.startTime);
					for (const [index, task] of sorted.entries()) {
						expect(task.startTime).toBeGreaterThanOrEqual(0);
						expect(task.startTime + task.duration).toBeLessThanOrEqual(DAY_MINUTES);
						if (index > 0)
							expect(task.startTime).toBeGreaterThanOrEqual(
								sorted[index - 1].startTime + sorted[index - 1].duration
							);
					}
				}
			})
		);
	});

	test('what ended before now today is done, everything else is open', () => {
		const now = 12 * 60 + 8;
		for (const task of sampleDay(TODAY, now)) {
			const ended = task.date === TODAY && task.startTime + task.duration <= now;
			expect(task.status).toBe(ended ? TaskStatus.Completed : TaskStatus.Pending);
		}
	});

	test('the gaps are left for to-dos and none is longer than two hours', () => {
		fc.assert(
			fc.property(minute, (now) => {
				const byDay = Map.groupBy(sampleDay(TODAY, now), (task) => task.date);
				for (const tasks of byDay.values()) {
					const sorted = tasks.toSorted((a, b) => a.startTime - b.startTime);
					for (const [index, task] of sorted.entries()) {
						if (index === 0 || task.startTime > 22 * 60) continue;
						const gap = task.startTime - (sorted[index - 1].startTime + sorted[index - 1].duration);
						expect(gap).toBeLessThanOrEqual(120);
					}
				}
			})
		);
	});

	test('no block is a free slot, the gaps stay empty', () => {
		for (const task of sampleDay(TODAY, 0)) expect(task.title.toLowerCase()).not.toContain('free');
	});
});
