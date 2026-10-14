/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { Priority, TaskStatus } from '#lib/types.js';
import { rank, type RankTask } from '#lib/priority.js';
import {
	BAR_MINUTES,
	endedAgo,
	headsUpLine,
	heroState,
	wrapUpStarted,
	wrapUpWindow
} from '#lib/now.js';

let nextId = 1;
const task = (
	title: string,
	startTime: number,
	duration: number,
	status = TaskStatus.Pending
): RankTask => ({
	id: nextId++,
	title,
	startTime,
	duration,
	priority: Priority.Medium,
	status
});

const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const settings = { overrunMinutes: 15 };
const stateAt = (tasks: RankTask[], now: number) => heroState(rank(tasks, now), now, settings);

describe('wrapUpWindow', () => {
	test.each([
		['a short task wraps up in its last 10 minutes', 30, 10],
		['a long task wraps up in its last quarter', 120, 30],
		['a tiny task wraps up in its second half only', 15, 7.5],
		['the quarter and 10 minutes meet at 40 minutes', 40, 10]
	])('%s', (_name, duration, window) => {
		expect(wrapUpWindow(duration)).toBe(window);
	});

	test('never longer than half of the task, never longer than the task', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 1440 }), (duration) => {
				expect(wrapUpWindow(duration)).toBeLessThanOrEqual(duration / 2);
			})
		);
	});
});

describe('heroState', () => {
	test('a task with plenty of time left is active', () => {
		const a = task('A', h(9), 60);
		expect(stateAt([a], h(9, 10))).toEqual({ kind: 'active', task: a, left: 50 });
	});

	test('the last 10 minutes of a short task are wrapping up, with the next task for the heads-up', () => {
		const a = task('A', h(9), 40);
		const b = task('B', h(10), 30);
		expect(stateAt([a, b], h(9, 30))).toEqual({
			kind: 'wrapping-up',
			task: a,
			left: 10,
			next: b
		});
		expect(stateAt([a, b], h(9, 29)).kind).toBe('active');
	});

	test('the last quarter of a long task is wrapping up', () => {
		const a = task('A', h(9), 240);
		expect(stateAt([a], h(12, 0)).kind).toBe('wrapping-up');
		expect(stateAt([a], h(11, 59)).kind).toBe('active');
	});

	test('a task that just ran out is time up with nothing current', () => {
		const a = task('A', h(9), 60);
		const state = stateAt([a], h(10, 3));
		expect(state).toEqual({ kind: 'time-up', ended: a, over: 3, current: null, next: null });
	});

	test('time up carries the next task for the line below', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(11), 30);
		expect(stateAt([a, b], h(10, 3))).toMatchObject({ kind: 'time-up', next: b });
	});

	test('time up stays until answered, for two overrun windows', () => {
		const a = task('A', h(9), 60);
		expect(stateAt([a], h(10, 29)).kind).toBe('time-up');
		expect(stateAt([a], h(10, 30)).kind).toBe('empty');
	});

	test('the overrun window setting sets how long time up stays', () => {
		const a = task('A', h(9), 60);
		const at = (now: number) => heroState(rank([a], now), now, { overrunMinutes: 5 }).kind;
		expect(at(h(10, 9))).toBe('time-up');
		expect(at(h(10, 10))).toBe('empty');
	});

	test('after time up the hero is free time when something is still planned', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(13), 30);
		expect(stateAt([a, b], h(10, 45))).toEqual({ kind: 'free', next: b });
	});

	test('answering time up with Done leaves it', () => {
		const done = task('A', h(9), 60, TaskStatus.Completed);
		expect(stateAt([done], h(10, 3)).kind).toBe('empty');
	});

	test('a task that started in place of the ended one shows under a transition bar', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(10), 60);
		expect(stateAt([a, b], h(10, 2))).toEqual({
			kind: 'time-up',
			ended: a,
			over: 2,
			current: b,
			next: null
		});
	});

	test('the transition bar goes when the new task is 15 minutes old', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(10), 120);
		expect(stateAt([a, b], h(10, BAR_MINUTES - 1)).kind).toBe('time-up');
		expect(stateAt([a, b], h(10, BAR_MINUTES))).toMatchObject({ kind: 'active', task: b });
	});

	test('the transition bar also goes after two overrun windows', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(10), 120);
		const state = heroState(rank([a, b], h(10, 10)), h(10, 10), { overrunMinutes: 5 });
		expect(state.kind).toBe('active');
	});

	test('nothing planned today is empty, only later tasks are free time', () => {
		expect(stateAt([], h(9)).kind).toBe('empty');
		const later = task('Later', h(15), 30);
		expect(stateAt([later], h(9))).toEqual({ kind: 'free', next: later });
	});

	test('only the latest ended task counts for time up', () => {
		const early = task('Early', h(8), 30);
		const late = task('Late', h(9), 60);
		expect(stateAt([early, late], h(10, 1))).toMatchObject({ kind: 'time-up', ended: late });
	});

	test('a current task is never lost: any minute of the day gives a state', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						start: fc.integer({ min: 0, max: 1380 }),
						duration: fc.integer({ min: 15, max: 240 })
					}),
					{ maxLength: 6 }
				),
				fc.integer({ min: 0, max: 1439 }),
				(spans, now) => {
					const tasks = spans.map((s, i) =>
						task(`T${i}`, s.start, Math.min(s.duration, 1440 - s.start))
					);
					const ranking = rank(tasks, now);
					const state = heroState(ranking, now, settings);
					if (ranking.current && state.kind !== 'time-up') {
						expect(state).toMatchObject({ task: ranking.current });
					}
					if (state.kind === 'time-up') expect(state.current).toBe(ranking.current);
				}
			)
		);
	});
});

describe('endedAgo', () => {
	test.each([
		[0, 'Ended just now'],
		[1, 'Ended 1 min ago'],
		[14, 'Ended 14 min ago']
	])('%d minutes over reads "%s"', (over, text) => {
		expect(endedAgo(over)).toBe(text);
	});
});

describe('wrapUpStarted', () => {
	const a = task('A', h(9), 60);

	test('true in the first two minutes of the wrap-up only', () => {
		expect(wrapUpStarted(a, h(9, 44))).toBe(false);
		expect(wrapUpStarted(a, h(9, 45))).toBe(true);
		expect(wrapUpStarted(a, h(9, 46))).toBe(true);
		expect(wrapUpStarted(a, h(9, 47))).toBe(false);
	});

	test('false once the task is over', () => {
		expect(wrapUpStarted(a, h(10, 5))).toBe(false);
	});
});

describe('headsUpLine', () => {
	const next = task('Call dentist', h(10), 30);

	test('names the task and the minutes', () => {
		expect(headsUpLine(next, h(9, 55), false)).toBe('Call dentist starts in 5 min');
	});

	test('tells a task that is wrapping up to wrap up', () => {
		expect(headsUpLine(next, h(9, 55), true)).toBe(
			'Call dentist starts in 5 min. Start wrapping up.'
		);
	});
});
