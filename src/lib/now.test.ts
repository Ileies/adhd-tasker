/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { Priority, TaskStatus } from '#lib/types.js';
import { rank, type RankTask } from '#lib/priority.js';
import {
	BAR_MINUTES,
	endedAgo,
	heroFocus,
	headsUpLine,
	heroDark,
	type HeroState,
	timeBoundState,
	wrapUpStarted,
	tabTitle,
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
/** What time-bound items make of the hero, `null` when none has the screen. */
const stateAt = (tasks: RankTask[], now: number) => timeBoundState(rank(tasks, now), now, settings);
/** The same as a hero, where no task at a time leaves the plan state. */
const heroAt = (tasks: RankTask[], now: number): HeroState<RankTask, { title: string }> =>
	stateAt(tasks, now) ?? { kind: 'plan', check: null };

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

describe('timeBoundState', () => {
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
		expect(stateAt([a, b], h(9, 29))?.kind).toBe('active');
	});

	test('the last quarter of a long task is wrapping up', () => {
		const a = task('A', h(9), 240);
		expect(stateAt([a], h(12, 0))?.kind).toBe('wrapping-up');
		expect(stateAt([a], h(11, 59))?.kind).toBe('active');
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
		expect(stateAt([a], h(10, 29))?.kind).toBe('time-up');
		expect(stateAt([a], h(10, 30))).toBeNull();
	});

	test('the overrun window setting sets how long time up stays', () => {
		const a = task('A', h(9), 60);
		const at = (now: number) => timeBoundState(rank([a], now), now, { overrunMinutes: 5 })?.kind;
		expect(at(h(10, 9))).toBe('time-up');
		expect(at(h(10, 10))).toBeUndefined();
	});

	test('after time up nothing time-bound has the screen, whatever is planned later', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(13), 30);
		expect(stateAt([a, b], h(10, 45))).toBeNull();
	});

	test('answering time up with Done leaves it', () => {
		const done = task('A', h(9), 60, TaskStatus.Completed);
		expect(stateAt([done], h(10, 3))).toBeNull();
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
		expect(stateAt([a, b], h(10, BAR_MINUTES - 1))?.kind).toBe('time-up');
		expect(stateAt([a, b], h(10, BAR_MINUTES))).toMatchObject({ kind: 'active', task: b });
	});

	test('the transition bar also goes after two overrun windows', () => {
		const a = task('A', h(9), 60);
		const b = task('B', h(10), 120);
		const state = timeBoundState(rank([a, b], h(10, 10)), h(10, 10), { overrunMinutes: 5 });
		expect(state?.kind).toBe('active');
	});

	test('nothing planned today, or only later, is nothing time-bound', () => {
		expect(stateAt([], h(9))).toBeNull();
		expect(stateAt([task('Later', h(15), 30)], h(9))).toBeNull();
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
					const state = timeBoundState(ranking, now, settings);
					if (ranking.current) expect(state).not.toBeNull();
					if (ranking.current && state?.kind !== 'time-up') {
						expect(state).toMatchObject({ task: ranking.current });
					}
					if (state?.kind === 'time-up') expect(state.current).toBe(ranking.current);
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

describe('heroFocus', () => {
	const a = task('Write intro', h(9), 60);
	const b = task('Call dentist', h(10), 30);

	test('is the running task, whether active or wrapping up', () => {
		expect(heroFocus(heroAt([a], h(9, 10)))).toBe(a);
		expect(heroFocus(heroAt([a], h(9, 55)))).toBe(a);
	});

	test('is the ended task on the time up screen', () => {
		expect(heroFocus(heroAt([a], h(10, 3)))).toBe(a);
	});

	test('is the new task under the transition bar, it owns the screen', () => {
		expect(heroFocus(heroAt([a, b], h(10, 2)))).toBe(b);
	});

	test('is nothing when no task has the screen', () => {
		expect(heroFocus(heroAt([b], h(8)))).toBeNull();
		expect(
			heroFocus({
				kind: 'todo',
				todo: { title: 'Study' },
				left: 20,
				length: 30,
				line: null,
				next: null,
				check: null,
				face: false,
				held: null,
				cost: null
			})
		).toBeNull();
	});
});

describe('tabTitle', () => {
	const a = task('Write intro', h(9), 60);
	const study = { title: 'Study B' };
	const hero = (state: HeroState<RankTask, { title: string }>) => tabTitle(state);

	test.each([
		['active', [a], h(9, 20), 'Write intro'],
		['wrapping up', [a], h(9, 52), 'Write intro'],
		['a long task', [task('Deep work', h(9), 240)], h(9, 20), 'Deep work'],
		['time up', [a], h(10, 3), 'Time is up - Write intro']
	])('%s', (_name, tasks, now, title) => {
		expect(tabTitle(heroAt(tasks, now))).toBe(title);
	});

	test('time up under the transition bar still says time is up', () => {
		const next = task('Review', h(10), 30);
		expect(tabTitle(heroAt([a, next], h(10, 2)))).toBe('Time is up - Write intro');
	});

	const ask = (level: 0 | 1) => ({
		about: 'progress' as const,
		todo: study,
		level,
		dueAt: 0,
		sessionStart: 0,
		sessionLength: 30,
		keeps: 0,
		early: false,
		sizeAsked: false,
		offerBreak: false
	});
	const session = {
		kind: 'todo',
		todo: study,
		left: 18,
		length: 30,
		line: null,
		next: null,
		face: false,
		held: null,
		cost: null
	} as const;
	const onBreak = {
		kind: 'break',
		todo: null,
		left: 6,
		minutes: 10,
		activity: 'water',
		last: false,
		rowId: 1
	} as const;

	test.each([
		['a session', { ...session, check: null }, 'Study B'],
		['a check', { ...session, left: 0, check: ask(0) }, 'How far? - Study B'],
		['a check asked again', { ...session, left: 0, check: ask(1) }, 'Still there? - Study B'],
		['a break', { ...onBreak, check: null }, 'Break'],
		['a break that is over', { ...onBreak, left: 0, check: ask(0) }, 'Break is over'],
		['a break asked again', { ...onBreak, left: 0, check: ask(1) }, 'Still there?'],
		['plan', { kind: 'plan', check: null }, "Plan what's next"],
		[
			'plan, asked if the user is there',
			{ kind: 'plan', check: { ...ask(0), todo: null } },
			'Still there?'
		],
		['the morning', { kind: 'away', since: null, todo: null, minutes: 0 }, 'Good morning'],
		['away', { kind: 'away', since: 700, todo: study, minutes: 20 }, 'Away'],
		['ready', { kind: 'ready', next: a, left: 8 }, 'Get ready'],
		['a called day', { kind: 'rest', why: 'called' }, 'Day is done'],
		['night', { kind: 'rest', why: 'night' }, 'Sleep']
	] as const)('%s', (_name, state, title) => {
		expect(hero(state)).toBe(title);
	});

	test('no title ever says the user is free', () => {
		for (const now of [h(8), h(12), h(23)])
			expect(tabTitle(heroAt([], now)).toLowerCase()).not.toContain('free');
	});
});

describe('heroDark', () => {
	test('is dark at night while nothing has the screen', () => {
		expect(heroDark({ kind: 'rest', why: 'night' })).toBe(true);
	});

	test('stays in color while a task runs, even at night', () => {
		const a = task('Write intro', h(23, 30), 30);
		expect(heroDark(heroAt([a], h(23, 40)))).toBe(false);
	});

	test('stays in color when the user called it a day', () => {
		expect(heroDark({ kind: 'rest', why: 'called' })).toBe(false);
	});
});
