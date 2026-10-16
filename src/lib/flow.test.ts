/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	currentKey,
	currentTitle,
	heroFromFlow,
	pinKey,
	pinStart,
	ASK_AGAIN_MINUTES,
	AWAY_MINUTES,
	EARLY_CHECK_MINUTES,
	READY_MINUTES,
	sessionTiming,
	switchLine
} from '#lib/flow.js';
import { Priority } from '#lib/types.js';
import { at, SimDay, simTask, simTodo } from '#test/simulate.js';

const hm = (hours: number, minutes = 0) => hours * 60 + minutes;
const kinds = (day: SimDay) => day.timeline.map(({ state }) => state.current.kind);

/** The four exams of the plan: all critical, 15 h, B due first. */
const studies = () => [
	simTodo(1, { dueDate: '2026-11-04' }),
	simTodo(2, { dueDate: '2026-11-01' }),
	simTodo(3, { dueDate: '2026-11-02' }),
	simTodo(4, { dueDate: '2026-11-03' })
];
const lunch = () => simTask(10, hm(12), 45, { title: 'Lunch' });

describe('4.8 the morning (without the start call)', () => {
	test('before the user did anything the hero is the morning and the first item shows in Next', () => {
		const day = new SimDay([simTask(10, hm(8), 15, { title: 'Meds' })], studies());
		const state = day.runTo(hm(7, 30));
		expect(state.current).toEqual({ kind: 'away', since: null, todo: null, from: null });
		expect(state.present).toBe(false);
		expect(state.next.map((task) => task.title)).toEqual(['Meds']);
	});

	test('nothing is pinned or started before Start', () => {
		const day = new SimDay([], studies());
		day.runTo(hm(9));
		expect(day.log).toEqual([]);
	});

	test('Meds takes the screen at 8:00 like any task at a time', () => {
		const day = new SimDay([simTask(10, hm(8), 15, { title: 'Meds' })], studies());
		expect(day.runTo(hm(8)).current).toMatchObject({ kind: 'task', task: { title: 'Meds' } });
	});

	test('Done on Meds starts the day and the first session follows', () => {
		const day = new SimDay([simTask(10, hm(8), 15, { title: 'Meds' })], studies());
		day.runTo(hm(8, 5));
		day.finishTask(10);
		const state = day.runTo(hm(8, 6));
		expect(state.present).toBe(true);
		expect(state.current).toMatchObject({ kind: 'todo', todo: { title: 'Study B' } });
	});

	test('Start does the same and says which to-do is first', () => {
		const day = new SimDay([], studies());
		day.runTo(hm(7, 30));
		day.start();
		expect(day.runTo(hm(7, 31)).current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
	});
});

describe('4.2 four exams, lunch in an hour (without the checks)', () => {
	const morning = () => {
		const day = new SimDay([lunch()], studies());
		day.jumpTo(hm(10, 30));
		day.start();
		return day;
	};

	test('Study B is current and pinned: it is due first', () => {
		const day = morning();
		const state = day.runTo(hm(11, 0));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
		expect(day.log.filter((row) => row.type === 'pin')).toHaveLength(2);
	});

	test('Next lists Lunch only, not the other studies', () => {
		const state = morning().runTo(hm(11));
		expect(state.next.map((task) => task.title)).toEqual(['Lunch']);
		expect(state.next[0].startTime - hm(11)).toBe(60);
	});

	test('a fifth to-do typed at 11:05 does not change the current one: the session is pinned', () => {
		const day = morning();
		day.runTo(hm(11, 4));
		day.todos.push(
			simTodo(5, { priority: Priority.Critical, dueDate: '2026-10-14', estimate: 600 })
		);
		const during = day.runTo(hm(11, 5)).current;
		expect(during).toMatchObject({ kind: 'todo', todo: { id: 2 } });
	});

	test('the heads-up for Lunch turns the session into get ready', () => {
		const day = morning();
		day.runTo(hm(11, 50));
		expect(day.peek().current).toMatchObject({ kind: 'todo' });
		expect(day.runTo(hm(11, 51)).current).toMatchObject({
			kind: 'ready',
			next: { title: 'Lunch' }
		});
	});

	test('12:00 Lunch takes the screen', () => {
		expect(morning().runTo(hm(12)).current).toMatchObject({ kind: 'task', task: { id: 10 } });
	});

	test('Lunch done early at 12:25: back to what was going well, with the reason', () => {
		const day = morning();
		day.runTo(hm(12, 25));
		day.finishTask(10);
		const state = day.runTo(hm(12, 26));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
		expect(day.timeline.at(-1)!.state.reason).toBe(
			'Staying with it, it still needs the most time today.'
		);
	});

	test('a session is never longer than the time before the next item', () => {
		const day = morning();
		const state = day.runTo(hm(11, 31));
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.end).toBe(at(hm(12)));
	});

	test('over the day every study gets time and the one due first gets the most', () => {
		const day = morning();
		day.runTo(hm(23));
		const minutes = day.minutesOn();
		for (const id of [1, 2, 3, 4]) expect(minutes.get(id) ?? 0).toBeGreaterThan(60);
		expect(minutes.get(2)!).toBeGreaterThanOrEqual(minutes.get(1)!);
	});
});

describe('4.7 nothing left to do', () => {
	test('with no to-do open the hero says plan what is next, and Next has the dinner', () => {
		const day = new SimDay([simTask(10, hm(18), 60, { title: 'Dinner' })]);
		day.jumpTo(hm(14));
		day.start();
		const state = day.runTo(hm(14, 1));
		expect(state.current).toEqual({ kind: 'plan' });
		expect(state.check).toBeNull();
		expect(state.next.map((task) => task.title)).toEqual(['Dinner']);
	});

	test('whatever is typed becomes current at once', () => {
		const day = new SimDay([simTask(10, hm(18), 60)]);
		day.jumpTo(hm(14));
		day.start();
		day.runTo(hm(14, 1));
		day.todos.push(simTodo(1, { title: 'Taxes', dueDate: null }));
		expect(day.runTo(hm(14, 2)).current).toMatchObject({ kind: 'todo', todo: { title: 'Taxes' } });
	});

	test('a low priority to-do due in ten years is current when it is the only open one', () => {
		const day = new SimDay(
			[],
			[simTodo(1, { priority: Priority.Low, dueDate: '2036-10-14', estimate: null })]
		);
		day.jumpTo(hm(14));
		day.start();
		expect(day.runTo(hm(14, 1)).current).toMatchObject({ kind: 'todo', todo: { id: 1 } });
	});

	test('less than ten minutes before the next item the hero says get ready', () => {
		const day = new SimDay([simTask(10, hm(18), 60, { title: 'Dinner' })]);
		day.jumpTo(hm(17, 50));
		day.start();
		expect(day.runTo(hm(17, 51)).current).toMatchObject({
			kind: 'ready',
			next: { title: 'Dinner' }
		});
		expect(READY_MINUTES).toBe(10);
	});

	test('a to-do held back until tomorrow leaves nothing to pick', () => {
		const day = new SimDay([], [simTodo(1, { notBefore: '2026-10-15' })]);
		day.jumpTo(hm(14));
		day.start();
		expect(day.runTo(hm(14, 1)).current).toEqual({ kind: 'plan' });
	});
});

describe('sessions and pins', () => {
	const started = (todos = studies()) => {
		const day = new SimDay([], todos);
		day.jumpTo(hm(9));
		day.start();
		return day;
	};

	test('the first tick of a session asks for a pin with the session start in its key', () => {
		const day = started();
		const state = day.peek();
		expect(state.pin).toEqual({ key: pinKey(at(hm(9))), todoId: 2, face: false });
		expect(pinStart(state.pin!.key)).toBe(at(hm(9)));
	});

	test('once the pin is written nothing more is asked', () => {
		const day = started();
		expect(day.tick().pin).toBeNull();
	});

	test('the same pin written by two devices is one row', () => {
		const day = started();
		const key = day.peek().pin!.key;
		day.write('pin', { todoId: 2, key });
		expect(day.peek().pin).toBeNull();
	});

	test('a new to-do with a higher need does not take over the running session', () => {
		const day = started();
		day.runTo(hm(9, 10));
		day.todos.push(simTodo(6, { dueDate: '2026-10-14', estimate: 120 }));
		expect(day.runTo(hm(9, 11)).current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
	});

	test('the next session starts with the answer to the check and is pinned again', () => {
		const day = started();
		day.diligent = false;
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 10 });
		const state = day.runTo(hm(9, 15));
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.start).toBe(at(hm(9, 15)));
		expect(day.log.filter((row) => row.type === 'pin').map((row) => row.key)).toEqual([
			pinKey(at(hm(9))),
			pinKey(at(hm(9, 15)))
		]);
	});

	test('a to-do that was pinned and then deleted is replaced, with its own pin key', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.todos = day.todos.filter((todo) => todo.id !== 2);
		const state = day.peek();
		expect(state.current).toMatchObject({ kind: 'todo' });
		expect(state.current.kind === 'todo' && state.current.todo.id).not.toBe(2);
		expect(state.pin?.key).toBe(pinKey(at(hm(9)), 1));
		expect(day.tick().pin).toBeNull();
	});

	test('a to-do that was pinned and then dropped is replaced too', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.todos.find((todo) => todo.id === 2)!.status = 'dropped';
		expect(day.runTo(hm(9, 6)).current).toMatchObject({ kind: 'todo', todo: { id: 3 } });
	});

	test('Done on the to-do starts a new session on another one at once', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.finishTodo(2);
		const state = day.runTo(hm(9, 6));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 3 } });
		if (state.current.kind === 'todo') expect(state.current.session.start).toBe(at(hm(9, 5)));
	});

	test('Do this now makes that to-do current, with no pin and no reason', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.choose(4);
		const state = day.peek();
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 4 } });
		expect(state.pin).toBeNull();
		expect(state.reason).toBeNull();
	});

	test('the chosen to-do keeps the session and is picked again after it only while it is behind', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.choose(4);
		day.runTo(hm(9, 5 + 15));
		expect(day.peek().current).toMatchObject({ kind: 'todo', todo: { id: 4 } });
		expect(day.peek().reason).toBe('Staying with it, it still needs the most time today.');
	});

	test('a to-do chosen even though it is held back until tomorrow is still done now', () => {
		const day = started([simTodo(1), simTodo(2, { notBefore: '2026-10-20' })]);
		day.choose(2);
		expect(day.peek().current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
	});

	test('a choice of a to-do that is gone is ignored', () => {
		const day = started();
		day.choose(99);
		expect(day.peek().current).toMatchObject({ kind: 'todo' });
	});
});

describe('time-bound items win', () => {
	test('a task at a time that contains now is current, to-dos wait', () => {
		const day = new SimDay([simTask(10, hm(10), 60)], studies());
		day.jumpTo(hm(9, 30));
		day.start();
		expect(day.runTo(hm(10, 15)).current).toMatchObject({ kind: 'task', task: { id: 10 } });
	});

	test('the last minutes of a task are its wrap-up', () => {
		const day = new SimDay([simTask(10, hm(10), 60)], studies());
		day.start();
		day.jumpTo(hm(10, 55));
		expect(day.peek().current).toMatchObject({ kind: 'task', wrapping: true, left: 5 });
		day.jumpTo(hm(10, 20));
		expect(day.peek().current).toMatchObject({ kind: 'task', wrapping: false, left: 40 });
	});

	test('time up shows as today and a new session follows once it is over', () => {
		const day = new SimDay([simTask(10, hm(10), 60)], studies());
		day.jumpTo(hm(9));
		day.start();
		day.runTo(hm(11, 5));
		expect(day.peek().current).toMatchObject({
			kind: 'time-up',
			ended: { id: 10 },
			over: 5,
			current: null
		});
		day.runTo(hm(11, 31));
		const after = day.peek();
		expect(after.current).toMatchObject({ kind: 'todo' });
		if (after.current.kind === 'todo') expect(after.current.session.start).toBe(at(hm(11, 30)));
	});

	test('a task that ran out unanswered is in missed, a done one is not', () => {
		const day = new SimDay([simTask(10, hm(8), 30), simTask(11, hm(8), 30)], studies());
		day.finishTask(11);
		day.jumpTo(hm(12));
		expect(day.peek().missed.map((task) => task.id)).toEqual([10]);
	});

	test('a to-do never takes the minute of an appointment: tasks are first, whatever the priority', () => {
		const day = new SimDay(
			[simTask(10, hm(9), 30, { priority: Priority.Low })],
			[simTodo(1, { dueDate: '2026-10-14', estimate: 600 })]
		);
		day.jumpTo(hm(9, 10));
		day.start();
		expect(day.peek().current).toMatchObject({ kind: 'task' });
	});

	test('a session before a task at a time is cut and starts again when it is done', () => {
		const day = new SimDay([simTask(10, hm(10), 30)], studies());
		day.jumpTo(hm(9, 30));
		day.start();
		day.runTo(hm(11, 1));
		const state = day.peek();
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.start).toBe(at(hm(11)));
	});
});

describe('calling it a day, night and undo', () => {
	test('Call it a day rests until My day ends, tasks at a time still come', () => {
		const day = new SimDay([simTask(10, hm(15), 30)], studies());
		day.jumpTo(hm(13));
		day.start();
		day.runTo(hm(13, 5));
		day.callItADay();
		expect(day.runTo(hm(13, 6)).current).toEqual({ kind: 'rest', why: 'called' });
		expect(day.runTo(hm(15, 5)).current).toMatchObject({ kind: 'task', task: { id: 10 } });
		expect(day.runTo(hm(16)).current).toEqual({ kind: 'rest', why: 'called' });
	});

	test('undo takes the day back', () => {
		const day = new SimDay([], studies());
		day.jumpTo(hm(13));
		day.start();
		day.runTo(hm(13, 5));
		const rest = day.callItADay();
		day.runTo(hm(13, 6));
		day.undo(rest.id);
		expect(day.runTo(hm(13, 7)).current).toMatchObject({ kind: 'todo' });
	});

	test('Do this now after resting ends the rest', () => {
		const day = new SimDay([], studies());
		day.jumpTo(hm(13));
		day.start();
		day.callItADay();
		day.runTo(hm(13, 5));
		day.choose(3);
		expect(day.runTo(hm(13, 6)).current).toMatchObject({ kind: 'todo', todo: { id: 3 } });
	});

	test('undoing Start leaves the user as not started', () => {
		const day = new SimDay([], studies());
		day.jumpTo(hm(9));
		const start = day.start();
		day.runTo(hm(9, 1));
		day.undo(start.id);
		expect(day.runTo(hm(9, 2)).current).toMatchObject({ kind: 'away', since: null });
	});

	test.each([
		['before My day', hm(6, 59)],
		['at the end of My day', hm(23)]
	])('night %s', (_name, minute) => {
		const day = new SimDay([], studies());
		day.start();
		day.jumpTo(minute);
		expect(day.peek().current).toEqual({ kind: 'rest', why: 'night' });
	});

	test('a task at night still has the screen', () => {
		const day = new SimDay([simTask(10, hm(23, 30), 30)], studies());
		day.jumpTo(hm(23, 40));
		expect(day.peek().current).toMatchObject({ kind: 'task' });
	});
});

describe('the days of the properties', () => {
	test('inside My day with an open to-do the engine never says plan', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						start: fc.integer({ min: hm(7), max: hm(22) }),
						duration: fc.integer({ min: 5, max: 120 })
					}),
					{ maxLength: 4 }
				),
				fc.integer({ min: hm(7), max: hm(22, 59) }),
				(windows, minute) => {
					const tasks = windows.map((window, index) =>
						simTask(index + 1, window.start, Math.min(window.duration, 1440 - window.start))
					);
					const day = new SimDay(tasks, [simTodo(1)]);
					day.jumpTo(hm(7));
					day.start();
					day.jumpTo(minute);
					expect(day.peek().current.kind).not.toBe('plan');
				}
			)
		);
	});

	test('a whole day with one open to-do never shows plan inside My day', () => {
		const day = new SimDay(
			[simTask(10, hm(12), 45), simTask(11, hm(18), 60)],
			[simTodo(1, { dueDate: null })]
		);
		day.jumpTo(hm(7, 30));
		day.start();
		day.runTo(hm(22, 59));
		expect(kinds(day)).not.toContain('plan');
	});

	test('without a new row, a task or the end of the session the current to-do never changes', () => {
		const day = new SimDay([], studies());
		day.jumpTo(hm(9));
		day.start();
		let last: number | null = null;
		let changes = 0;
		day.runTo(hm(9, 14), (_minute, state) => {
			if (state.current.kind !== 'todo') return;
			if (last !== null && last !== state.current.todo.id) changes++;
			last = state.current.todo.id;
		});
		expect(changes).toBe(0);
	});

	test('equal to-dos split a simulated day within 20 %', () => {
		const equal = [1, 2, 3, 4].map((id) => simTodo(id, { dueDate: '2026-11-03' }));
		const day = new SimDay([simTask(10, hm(12), 45), simTask(11, hm(18), 60)], equal);
		day.jumpTo(hm(7, 30));
		day.start();
		day.runTo(hm(22, 59));
		const minutes = [...day.minutesOn().values()];
		expect(minutes).toHaveLength(4);
		expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(
			Math.max(...minutes) * 0.2
		);
	});

	test('over a week every open to-do gets time', () => {
		for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
			const todos = [
				simTodo(1, { dueDate: '2026-10-21', priority: Priority.Low }),
				simTodo(2, { dueDate: '2026-12-31', priority: Priority.Medium, estimate: null }),
				simTodo(3, { dueDate: null, priority: Priority.Low, estimate: 30 })
			];
			const day = new SimDay([simTask(10, hm(12), 45)], todos);
			day.jumpTo(hm(7, 30));
			day.start();
			day.runTo(hm(22, 59));
			for (const id of [1, 2, 3]) expect(day.minutesOn().get(id) ?? 0).toBeGreaterThan(0);
		}
	});

	test('a task at a time always wins its minutes', () => {
		const day = new SimDay([simTask(10, hm(12), 45), simTask(11, hm(15), 30)], studies());
		day.jumpTo(hm(7, 30));
		day.start();
		day.runTo(hm(16));
		for (const { minute, state } of day.timeline) {
			const inside = (start: number, length: number) => minute >= start && minute < start + length;
			if (inside(hm(12), 45) || inside(hm(15), 30)) expect(state.current.kind).toBe('task');
		}
	});
});

describe('currentKey', () => {
	test.each([
		[{ kind: 'task', task: { id: 4 }, left: 5, wrapping: false }, 'task:4'],
		[{ kind: 'time-up', ended: { id: 4 }, over: 3, current: null }, 'time-up:4'],
		[{ kind: 'time-up', ended: { id: 4 }, over: 3, current: { id: 9 } }, 'task:9'],
		[{ kind: 'todo', todo: { id: 7 }, session: { start: 0, end: 1, length: 30 } }, 'todo:7'],
		[{ kind: 'ready', next: { id: 4 } }, 'ready'],
		[{ kind: 'away', since: null }, 'away'],
		[{ kind: 'plan' }, 'plan'],
		[{ kind: 'rest', why: 'night' }, 'night'],
		[{ kind: 'rest', why: 'called' }, 'rest']
	] as const)('%j is %s', (current, key) => {
		expect(currentKey(current as never)).toBe(key);
	});
});

describe('pin keys', () => {
	test('a key carries the session start and an attempt', () => {
		expect(pinKey(1000)).toBe('pin:1000');
		expect(pinKey(1000, 2)).toBe('pin:1000:2');
		expect(pinStart('pin:1000')).toBe(1000);
		expect(pinStart('pin:1000:2')).toBe(1000);
	});

	test.each(['', null, 'start', 'pin:', 'pin:x', 'pin:1:'])('%p is not a pin key', (key) => {
		expect(pinStart(key)).toBeNull();
	});
});

describe('currentTitle and switchLine', () => {
	const task = { id: 1, title: 'Lunch' };
	const todo = { id: 2, title: 'Study B' };
	const session = { start: 0, end: 1, length: 30 };

	test.each([
		[{ kind: 'task', task, left: 5, wrapping: false }, 'Lunch'],
		[{ kind: 'time-up', ended: task, over: 1, current: null }, 'Lunch'],
		[{ kind: 'time-up', ended: task, over: 1, current: { id: 3, title: 'Call' } }, 'Call'],
		[{ kind: 'todo', todo, session, face: false }, 'Study B'],
		[{ kind: 'break', start: 0, end: 1, minutes: 10, activity: 'water', last: false, todo }, null],
		[{ kind: 'ready', next: task }, null],
		[{ kind: 'away', since: null }, null],
		[{ kind: 'plan' }, null],
		[{ kind: 'rest', why: 'night' }, null]
	] as const)('%j has the title %p', (current, title) => {
		expect(currentTitle(current as never)).toBe(title);
	});

	test('a to-do says why it was picked, every other state has its own line', () => {
		expect(
			switchLine({ current: { kind: 'todo', todo, session, face: false }, reason: 'Due today' })
		).toBe('Due today');
		expect(
			switchLine({ current: { kind: 'todo', todo, session, face: false }, reason: null })
		).toBe('The next session started');
		const lines = [
			{ kind: 'task', task, left: 1, wrapping: false },
			{ kind: 'time-up', ended: task, over: 1, current: null },
			{ kind: 'break', start: 0, end: 1, minutes: 10, activity: 'water', last: false, todo: null },
			{ kind: 'break', start: 0, end: 1, minutes: 10, activity: 'water', last: false, todo },
			{ kind: 'ready', next: task },
			{ kind: 'away', since: null },
			{ kind: 'away', since: 700, todo, from: 1 },
			{ kind: 'plan' },
			{ kind: 'rest', why: 'night' },
			{ kind: 'rest', why: 'called' }
		].map((current) => switchLine({ current: current as never, reason: null }));
		expect(new Set(lines).size).toBe(lines.length);
	});
});

describe('heroFromFlow', () => {
	const hero = (day: SimDay, minute: number) => {
		const state = day.runTo(minute);
		return heroFromFlow(state, minute, at(minute));
	};
	const started = (tasks = [lunch()]) => {
		const day = new SimDay(tasks, studies());
		day.jumpTo(hm(10, 30));
		day.start();
		return day;
	};

	test('the morning is away until the user starts', () => {
		const day = new SimDay([], studies());
		expect(hero(day, hm(7, 30))).toEqual({ kind: 'away', since: null, todo: null, minutes: 0 });
	});

	test('a session counts down to its planned end, with the next task for the line below', () => {
		const day = started();
		expect(hero(day, hm(10, 40))).toMatchObject({
			kind: 'todo',
			todo: { id: 2 },
			left: 5,
			length: 15,
			next: { title: 'Lunch' },
			check: null
		});
	});

	test('after the check the bar fills again for a full session', () => {
		const day = started();
		expect(hero(day, hm(10, 50))).toMatchObject({
			kind: 'todo',
			left: 25,
			length: 30,
			check: null
		});
	});

	test('when the session is over the hero carries the question', () => {
		const day = started();
		day.diligent = false;
		expect(hero(day, hm(10, 46))).toMatchObject({
			kind: 'todo',
			left: 0,
			check: { level: 0, todo: { id: 2 } }
		});
	});

	test('away carries what was running and for how long, up to two hours', () => {
		const day = started();
		day.diligent = false;
		expect(hero(day, hm(10, 52))).toMatchObject({
			kind: 'away',
			since: hm(10, 50),
			todo: { id: 2 },
			minutes: 22
		});
		expect(hero(day, hm(11, 5))).toMatchObject({ kind: 'away', minutes: 35 });
	});

	test('less than ten minutes before a task the hero says get ready, with the minutes left', () => {
		const day = started();
		expect(hero(day, hm(11, 51))).toMatchObject({
			kind: 'ready',
			next: { title: 'Lunch' },
			left: 9
		});
	});

	test('a task at a time shows as active and, in its last minutes, as wrapping up', () => {
		const day = started();
		expect(hero(day, hm(12, 10)).kind).toBe('active');
		expect(hero(day, hm(12, 40))).toMatchObject({ kind: 'wrapping-up', left: 5 });
	});

	test('time up carries the next task for the line below', () => {
		const day = started([lunch(), simTask(11, hm(14), 30, { title: 'Call' })]);
		expect(hero(day, hm(12, 50))).toMatchObject({ kind: 'time-up', next: { title: 'Call' } });
	});

	test('states without an item come through as they are', () => {
		const day = new SimDay([], []);
		day.jumpTo(hm(10));
		day.start();
		expect(hero(day, hm(10, 1))).toEqual({ kind: 'plan', check: null });
		expect(hero(day, hm(23, 30))).toEqual({ kind: 'rest', why: 'night' });
	});
});

describe('the check at the end of a session', () => {
	/** A user who does not answer by themselves: every answer in these tests is written by hand. */
	const started = (minute = hm(9), tasks = [] as ReturnType<typeof simTask>[]) => {
		const day = new SimDay(tasks, studies());
		day.diligent = false;
		day.jumpTo(minute);
		day.start();
		return day;
	};
	const todoSession = (day: SimDay) => {
		const { current } = day.peek();
		if (current.kind !== 'todo') throw new Error('expected a to-do');
		return current.session;
	};

	test('the first session after Start is a warm-up of 15 minutes', () => {
		const day = started();
		day.runTo(hm(9, 5));
		expect(todoSession(day)).toEqual({ start: at(hm(9)), end: at(hm(9, 15)), length: 15 });
		expect(day.peek().check).toBeNull();
	});

	test('when it is over the to-do stays and the question is asked', () => {
		const day = started();
		const state = day.runTo(hm(9, 15));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
		expect(state.check).toMatchObject({
			todo: { id: 2 },
			level: 0,
			sessionStart: at(hm(9)),
			sessionLength: 15,
			keeps: 0,
			early: false,
			sizeAsked: false
		});
	});

	test('a check nobody answers is asked again after two minutes', () => {
		const day = started();
		expect(day.runTo(hm(9, 14 + ASK_AGAIN_MINUTES)).check?.level).toBe(0);
		expect(day.runTo(hm(9, 15 + ASK_AGAIN_MINUTES)).check?.level).toBe(1);
	});

	test('after five minutes the user is away since then, and the hero knows what was running', () => {
		const day = started();
		const state = day.runTo(hm(9, 15 + AWAY_MINUTES));
		expect(state.current).toEqual({
			kind: 'away',
			since: hm(9, 20),
			todo: expect.objectContaining({ id: 2 }),
			from: at(hm(9))
		});
		expect(state.present).toBe(false);
		expect(state.check).toBeNull();
	});

	test('while away nothing is asked and nothing is pinned', () => {
		const day = started();
		day.runTo(hm(10, 30));
		expect(day.log.filter((row) => row.type === 'pin')).toHaveLength(1);
		for (const { minute, state } of day.timeline)
			if (minute >= hm(9, 20)) expect(state.current.kind).toBe('away');
	});

	test("I'm back starts a warm-up on a fresh pick", () => {
		const day = started();
		day.runTo(hm(10));
		day.start();
		const state = day.runTo(hm(10, 1));
		expect(state.present).toBe(true);
		expect(todoSession(day)).toMatchObject({ start: at(hm(10)), length: 15 });
	});

	test('"I was working on it" is a check after away and starts a warm-up too', () => {
		const day = started();
		day.runTo(hm(10));
		day.answer(2, { before: 0, after: 20, minutes: 60, worked: true });
		day.runTo(hm(10, 1));
		expect(day.peek().present).toBe(true);
		expect(todoSession(day).length).toBe(15);
	});

	test('an answer starts the next session, a full one after a warm-up', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 10 });
		day.runTo(hm(9, 16));
		expect(todoSession(day)).toMatchObject({ start: at(hm(9, 15)), length: 30 });
		expect(day.peek().check).toBeNull();
	});

	test('two good answers in a row make the next session 45 minutes', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 10 });
		day.runTo(hm(9, 45));
		day.answer(2, { before: 10, after: 30 });
		day.runTo(hm(9, 46));
		expect(todoSession(day).length).toBe(45);
	});

	test('a slow answer is not a good one and ends the streak', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 10 });
		day.runTo(hm(9, 45));
		day.answer(2, { before: 10, after: 10, slow: true });
		day.runTo(hm(9, 46));
		expect(todoSession(day).length).toBe(30);
	});

	test('after "I couldn\'t focus" the next session is a warm-up again', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 10 });
		day.runTo(hm(9, 45));
		day.answer(2, { before: 10, after: 10, pace: 'unfocused', slow: true });
		day.runTo(hm(9, 46));
		expect(todoSession(day).length).toBe(15);
	});

	test('Keep going is counted in a row, and a number ends the count', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 0, keep: true });
		expect(day.runTo(hm(9, 45)).check?.keeps).toBe(1);
		day.answer(2, { before: 0, after: 0, keep: true });
		expect(day.runTo(hm(10, 30)).check?.keeps).toBe(2);
		day.answer(2, { before: 0, after: 5 });
		// Two good answers made the session 45 minutes long
		expect(day.runTo(hm(11, 15)).check?.keeps).toBe(0);
	});

	test('"How big is all of it?" is asked once per to-do, Not sure included', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.answer(2, { before: 0, after: 5, size: null });
		expect(day.runTo(hm(9, 45)).check?.sizeAsked).toBe(true);
		const other = started();
		other.runTo(hm(9, 15));
		expect(other.peek().check?.sizeAsked).toBe(false);
	});

	test('Do this now has its check too, on the chosen to-do', () => {
		const day = started();
		day.runTo(hm(9, 5));
		day.choose(4);
		const state = day.runTo(hm(9, 20));
		expect(state.check).toMatchObject({ todo: { id: 4 }, sessionStart: at(hm(9, 5)) });
	});

	test('Done on the to-do starts a warm-up and takes the question with it', () => {
		const day = started();
		day.runTo(hm(9, 15));
		day.finishTodo(2);
		const state = day.runTo(hm(9, 16));
		expect(state.check).toBeNull();
		expect(todoSession(day).length).toBe(15);
	});

	test('a check is never asked outside My day', () => {
		const day = new SimDay([], studies());
		day.diligent = false;
		day.jumpTo(hm(22, 30));
		day.start();
		const state = day.runTo(hm(23, 5));
		expect(state.check).toBeNull();
		expect(state.current).toEqual({ kind: 'rest', why: 'night' });
	});
});

describe('4.6 nobody answers', () => {
	test('Lunch still takes the screen of an away user, and the day stays away after it', () => {
		const day = new SimDay([lunch()], studies());
		day.diligent = false;
		day.jumpTo(hm(10, 30));
		day.start();
		expect(day.runTo(hm(11, 5)).current.kind).toBe('away');
		const lunchState = day.runTo(hm(12));
		expect(lunchState.current).toMatchObject({ kind: 'task', task: { id: 10 } });
		expect(lunchState.present).toBe(false);
		expect(day.runTo(hm(13, 20)).current).toMatchObject({ kind: 'away', since: hm(10, 50) });
	});

	test("I'm back after lunch starts a warm-up", () => {
		const day = new SimDay([lunch()], studies());
		day.diligent = false;
		day.jumpTo(hm(10, 30));
		day.start();
		day.runTo(hm(13, 20));
		day.start();
		day.runTo(hm(13, 21));
		const state = day.peek();
		expect(state.present).toBe(true);
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session).toMatchObject({ start: at(hm(13, 20)), length: 15 });
	});

	test('Done on Lunch brings an away user back', () => {
		const day = new SimDay([lunch()], studies());
		day.diligent = false;
		day.jumpTo(hm(10, 30));
		day.start();
		day.runTo(hm(12, 25));
		day.finishTask(10);
		const state = day.runTo(hm(12, 26));
		expect(state.present).toBe(true);
		expect(state.current.kind).toBe('todo');
	});

	test('a user who answers every check is never away, whatever the day holds', () => {
		const day = new SimDay([lunch(), simTask(11, hm(15), 30)], studies());
		day.jumpTo(hm(7, 30));
		day.start();
		day.runTo(hm(22, 59));
		expect(kinds(day)).not.toContain('away');
	});

	test('every away is caught within five minutes of the question that went unanswered', () => {
		const day = new SimDay([], studies());
		day.diligent = false;
		day.jumpTo(hm(9));
		day.start();
		day.runTo(hm(9, 30));
		const asked = day.timeline.find(({ state }) => state.check)!;
		const away = day.timeline.find(({ state }) => state.current.kind === 'away')!;
		expect(away.minute - asked.minute).toBe(AWAY_MINUTES);
	});

	test('away never starts during a time-bound item, whatever the day looks like', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						start: fc.integer({ min: hm(8), max: hm(21) }),
						duration: fc.integer({ min: 5, max: 90 })
					}),
					{ maxLength: 4 }
				),
				fc.integer({ min: hm(7), max: hm(20) }),
				(windows, startMinute) => {
					const tasks = windows.map((window, index) =>
						simTask(index + 1, window.start, window.duration)
					);
					const day = new SimDay(tasks, studies());
					day.diligent = false;
					day.jumpTo(startMinute);
					day.start();
					day.runTo(hm(22, 59));
					for (const { minute, state } of day.timeline) {
						const inside = tasks.some(
							(task) => minute >= task.startTime && minute < task.startTime + task.duration
						);
						if (inside) expect(state.check).toBeNull();
						if (state.current.kind === 'away' && state.current.since !== null)
							for (const task of tasks)
								expect(
									state.current.since >= task.startTime &&
										state.current.since < task.startTime + task.duration
								).toBe(false);
					}
				}
			)
		);
		// A hundred whole days stepped by the minute: slow when the gate runs everything at once with coverage
	}, 30_000);
});

describe('the early check and get ready', () => {
	const lunchDay = () => {
		const day = new SimDay([lunch()], studies());
		day.diligent = false;
		day.jumpTo(hm(10, 30));
		day.start();
		day.runTo(hm(10, 45));
		day.answer(2, { before: 0, after: 0, keep: true });
		day.runTo(hm(11, 15));
		day.answer(2, { before: 0, after: 0, keep: true });
		return day;
	};

	test('Lunch is 15 minutes away: the check comes now instead of at the end of the session, asked once', () => {
		const day = lunchDay();
		expect(day.runTo(hm(11, 44)).check).toBeNull();
		const early = day.runTo(hm(12) - EARLY_CHECK_MINUTES).check;
		expect(early).toMatchObject({ early: true, level: 0, todo: { id: 2 } });
		expect(day.runTo(hm(11, 48)).check).toMatchObject({ early: true, level: 0 });
	});

	test('unanswered, it gives way to get ready, and nobody is away', () => {
		const day = lunchDay();
		const state = day.runTo(hm(11, 51));
		expect(state.current).toMatchObject({ kind: 'ready' });
		expect(state.check).toBeNull();
		expect(state.present).toBe(true);
		expect(day.runTo(hm(13, 31)).current.kind).toBe('todo');
	});

	test('a session that just began is not asked about the item that is coming', () => {
		const day = lunchDay();
		day.runTo(hm(11, 40));
		day.answer(2, { before: 0, after: 5 });
		expect(day.runTo(hm(11, 48)).check).toBeNull();
	});

	test('a warm-up that would end inside the get ready minutes is not asked at all', () => {
		const day = new SimDay([lunch()], studies());
		day.diligent = false;
		day.jumpTo(hm(11, 36));
		day.start();
		for (let minute = hm(11, 36); minute < hm(11, 50); minute++)
			expect(day.runTo(minute).check).toBeNull();
	});
});

describe('the plan state is asked about too', () => {
	const planDay = () => {
		const day = new SimDay([simTask(10, hm(18), 60)]);
		day.diligent = false;
		day.jumpTo(hm(14));
		day.start();
		return day;
	};

	test('nothing to pick: "still there?" after the warm-up, asked again, then away', () => {
		const day = planDay();
		expect(day.runTo(hm(14, 14)).check).toBeNull();
		expect(day.runTo(hm(14, 15)).check).toMatchObject({ todo: null, level: 0 });
		expect(day.runTo(hm(14, 17)).check).toMatchObject({ todo: null, level: 1 });
		expect(day.runTo(hm(14, 20)).current).toMatchObject({
			kind: 'away',
			since: hm(14, 20),
			todo: null
		});
	});

	test('answering it starts the next stretch', () => {
		const day = planDay();
		day.runTo(hm(14, 15));
		day.start();
		expect(day.runTo(hm(14, 16)).check).toBeNull();
		expect(day.peek().current.kind).toBe('plan');
	});
});

/** The user starts at 10:30 and answers nothing on their own, a test drives every answer. */
const morning = (tasks = [lunch()], todos = studies()) => {
	const day = new SimDay(tasks, todos);
	day.diligent = false;
	day.jumpTo(hm(10, 30));
	day.start();
	return day;
};
const currentId = (day: SimDay) => {
	const { current } = day.peek();
	return current.kind === 'todo' ? current.todo.id : null;
};

describe('4.3 losing steam: rotate, rotate, break, lunch', () => {
	test('the first struggle switches to another to-do at once and says so', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		expect(day.peek().check).toMatchObject({ about: 'progress', todo: { id: 2 } });
		expect(day.struggle('unfocused', 2)).toMatchObject({ step: 'rotate', low: false });
		const state = day.runTo(hm(10, 46));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { title: 'Study C' } });
		expect(state.reason).toBe('Switched from Study B. It comes back later.');
	});

	test('it is a warm-up of 15 minutes and its question comes at 11:00', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		const state = day.runTo(hm(10, 46));
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.length).toBe(15);
		expect(day.runTo(hm(10, 59)).check).toBeNull();
		// The rotation follows the answer by a millisecond, so the 15 minutes end a moment after 11:00
		expect(day.runTo(hm(11, 1)).check).toMatchObject({ about: 'progress', todo: { id: 3 } });
	});

	test('the second struggle rotates again, and the first one is still cooling down', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.runTo(hm(11));
		expect(day.struggle('unfocused', 3)).toMatchObject({ step: 'rotate' });
		expect(day.runTo(hm(11, 1)).current).toMatchObject({
			kind: 'todo',
			todo: { title: 'Study D' }
		});
	});

	test('the third is a break of 10 minutes, the hero shows its activity', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.runTo(hm(11));
		day.struggle('unfocused', 3);
		day.runTo(hm(11, 10));
		expect(day.struggle('low-energy', 4)).toMatchObject({
			step: 'break',
			minutes: 10,
			last: false
		});
		const state = day.runTo(hm(11, 11));
		expect(state.current).toMatchObject({
			kind: 'break',
			minutes: 10,
			activity: 'water',
			todo: null
		});
		expect(state.check).toBeNull();
		expect(heroFromFlow(state, hm(11, 11), at(hm(11, 11)))).toMatchObject({
			kind: 'break',
			left: 9,
			minutes: 10
		});
	});

	test('when the break is over the question asks to go back, the cool downs are gone', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.runTo(hm(11));
		day.struggle('unfocused', 3);
		day.runTo(hm(11, 10));
		day.struggle('low-energy', 4);
		const state = day.runTo(hm(11, 20));
		expect(state.check).toMatchObject({ about: 'break', level: 0, todo: { title: 'Study B' } });
		expect(state.current).toMatchObject({ kind: 'break', todo: { title: 'Study B' } });
		expect(heroFromFlow(state, hm(11, 20), at(hm(11, 20)))).toMatchObject({ left: 0 });
	});

	test("Let's go starts a warm-up on it", () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.runTo(hm(11));
		day.struggle('unfocused', 3);
		day.runTo(hm(11, 10));
		day.struggle('low-energy', 4);
		day.runTo(hm(11, 21));
		day.back();
		const state = day.runTo(hm(11, 22));
		expect(state.check).toBeNull();
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.todo.title).toBe('Study B');
		expect(state.current.session).toMatchObject({ start: at(hm(11, 21)), length: 15 });
	});

	test('the first struggle after a break rotates to a short to-do for the hour', () => {
		const email = simTodo(5, {
			title: 'Email',
			estimate: 20,
			priority: Priority.Low,
			dueDate: '2026-12-31'
		});
		const day = morning([], [...studies(), email]);
		day.runTo(hm(10, 40));
		day.takeBreak(10);
		day.runTo(hm(10, 50));
		day.back();
		day.runTo(hm(11, 5));
		expect(day.struggle('unfocused', currentId(day)!)).toMatchObject({ step: 'rotate', low: true });
		const state = day.runTo(hm(11, 6));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { title: 'Email' } });
		expect(state.reason).toBe('Switched from Study B. A short one while energy is low.');
	});

	test('the second struggle after a break is a long break and then the question about the day', () => {
		const day = morning();
		day.runTo(hm(10, 40));
		day.takeBreak(10);
		day.runTo(hm(10, 50));
		day.back();
		day.runTo(hm(11, 5));
		day.struggle('unfocused', currentId(day)!);
		day.runTo(hm(11, 20));
		expect(day.struggle('unfocused', currentId(day)!)).toMatchObject({
			step: 'break',
			minutes: 20,
			last: true
		});
		expect(day.runTo(hm(11, 39)).check).toBeNull();
		const state = day.runTo(hm(11, 40));
		expect(state.check).toMatchObject({ about: 'day' });
		expect(state.current).toMatchObject({ kind: 'break', last: true });
	});

	test('with only one to-do the first struggle is a break, there is nothing to rotate to', () => {
		const day = morning([], [simTodo(1)]);
		day.runTo(hm(10, 45));
		expect(day.struggle('unfocused', 1)).toMatchObject({ step: 'break', minutes: 10 });
		expect(day.runTo(hm(10, 46)).current.kind).toBe('break');
	});

	test('the one left cools down for an hour, then it may come back', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.diligent = true;
		day.runTo(hm(11, 44));
		const during = day.timeline.filter(({ minute }) => minute > hm(10, 45));
		expect(
			during.some(({ state }) => state.current.kind === 'todo' && state.current.todo.id === 2)
		).toBe(false);
	});

	test('Undo on the rotation stays on the to-do', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		const rotation = day.log.findLast((row) => row.type === 'rotate')!;
		day.runTo(hm(10, 46));
		expect(currentId(day)).toBe(3);
		day.undo(rotation.id);
		const state = day.runTo(hm(10, 47));
		expect(currentId(day)).toBe(2);
		expect(state.check).toBeNull();
	});

	test('a break the user asked for does not end the session for good: Keep working instead', () => {
		const day = morning();
		day.runTo(hm(10, 35));
		const asked = day.takeBreak(10);
		expect(day.runTo(hm(10, 36)).current.kind).toBe('break');
		day.undo(asked.id);
		const state = day.runTo(hm(10, 37));
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.todo.id).toBe(2);
		// The undo is a point of its own: the session on the same to-do starts again from there
		expect(state.current.session.start).toBe(at(hm(10, 36)));
	});
});

describe('4.4 lunch done early, and lunch ending a break', () => {
	test('Lunch takes the screen from a break that would run into it, nobody is asked', () => {
		const day = morning();
		day.runTo(hm(11, 40));
		day.takeBreak(20);
		const states = [hm(11, 41), hm(11, 49), hm(11, 51), hm(11, 59), hm(12)].map((minute) =>
			day.runTo(minute)
		);
		expect(states.map((state) => state.current.kind)).toEqual([
			'break',
			'break',
			'ready',
			'ready',
			'task'
		]);
		const asked = day.timeline.filter(({ minute }) => minute >= hm(11, 40) && minute <= hm(12));
		expect(asked.every(({ state }) => state.check === null)).toBe(true);
	});

	test('Done on Lunch brings the user back with a warm-up on what was going well', () => {
		const day = morning();
		day.runTo(hm(11, 40));
		day.takeBreak(20);
		day.runTo(hm(12, 25));
		day.finishTask(10);
		const state = day.runTo(hm(12, 26));
		expect(state.present).toBe(true);
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session).toMatchObject({ start: at(hm(12, 25)), length: 15 });
	});

	test('a break that is not cut ends with its question, asked again and then away like any check', () => {
		const day = morning([], studies());
		day.runTo(hm(10, 40));
		day.takeBreak(10);
		expect(day.runTo(hm(10, 52)).check).toMatchObject({ about: 'break', level: 1 });
		const away = day.runTo(hm(10, 55));
		expect(away.current).toMatchObject({ kind: 'away', since: hm(10, 55), todo: null });
	});

	test("I'm back before the break is over starts a warm-up at once", () => {
		const day = morning();
		day.runTo(hm(10, 40));
		day.takeBreak(10);
		day.runTo(hm(10, 43));
		day.back();
		const state = day.runTo(hm(10, 44));
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session).toMatchObject({ start: at(hm(10, 43)), length: 15 });
	});

	test('5 more minutes is another break', () => {
		const day = morning([], studies());
		day.runTo(hm(10, 40));
		day.takeBreak(10);
		day.runTo(hm(10, 50));
		day.takeBreak(5, { activity: 'window' });
		const state = day.runTo(hm(10, 52));
		expect(state.current).toMatchObject({ kind: 'break', minutes: 5, activity: 'window' });
		expect(state.check).toBeNull();
		expect(day.runTo(hm(10, 55)).check).toMatchObject({ about: 'break' });
	});

	test('"Call it a day" answers the question after the last break', () => {
		const day = morning([], studies());
		day.runTo(hm(10, 40));
		day.takeBreak(20, { last: true });
		day.runTo(hm(11, 1));
		expect(day.peek().check).toMatchObject({ about: 'day' });
		day.callItADay();
		expect(day.runTo(hm(11, 2)).current).toEqual({ kind: 'rest', why: 'called' });
	});
});

describe('Give it 5 minutes first', () => {
	test('"Something else" in minute 2 holds, and the switch happens by itself in minute 7', () => {
		const day = morning();
		day.runTo(hm(10, 32));
		expect(day.struggle('else', 2)).toMatchObject({ step: 'rotate', hold: true });
		const waiting = day.runTo(hm(10, 36));
		expect(waiting.current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
		const rotation = day.log.findLast((row) => row.type === 'rotate')!;
		expect(waiting.held).toEqual({ until: at(hm(10, 37)), step: 'rotate', rowId: rotation.id });
		expect(heroFromFlow(waiting, hm(10, 36), at(hm(10, 36)))).toMatchObject({
			held: { until: at(hm(10, 37)) }
		});
		const switched = day.runTo(hm(10, 37));
		expect(switched.current).toMatchObject({ kind: 'todo', todo: { title: 'Study C' } });
		expect(switched.held).toBeNull();
	});

	test('doing anything meanwhile cancels it', () => {
		const day = morning();
		day.runTo(hm(10, 32));
		day.struggle('else', 2);
		day.runTo(hm(10, 34));
		day.choose(2);
		expect(day.runTo(hm(10, 40)).current).toMatchObject({ kind: 'todo', todo: { id: 2 } });
	});

	test('after the first 5 minutes it switches at once', () => {
		const day = morning();
		day.runTo(hm(10, 36));
		expect(day.struggle('else', 2)).toMatchObject({ step: 'rotate', hold: false });
		expect(day.runTo(hm(10, 36)).current).toMatchObject({
			kind: 'todo',
			todo: { title: 'Study C' }
		});
	});

	test('a to-do that struggled today is not held, they tried already', () => {
		const day = morning();
		day.runTo(hm(10, 45));
		day.struggle('unfocused', 2);
		day.runTo(hm(10, 50));
		day.undo(day.log.findLast((row) => row.type === 'rotate')!.id);
		day.runTo(hm(10, 51));
		expect(day.struggle('else', 2)).toMatchObject({ hold: false });
	});

	test('the held rotation counts as a skip of the to-do', () => {
		const day = morning();
		day.runTo(hm(10, 32));
		day.struggle('else', 2);
		expect(day.todos.find((todo) => todo.id === 2)).toMatchObject({
			skips: 1,
			skipSince: '2026-10-14'
		});
	});
});

describe('Face it', () => {
	const faced = () =>
		studies().map((todo) =>
			todo.id === 2 ? { ...todo, skips: 3, skipSince: '2026-10-12' } : todo
		);

	test('a to-do pushed away on more than one day is named when it is picked, for ten minutes', () => {
		const day = morning([], faced());
		const state = day.runTo(hm(10, 31));
		expect(state.current).toMatchObject({ kind: 'todo', todo: { id: 2 }, face: true });
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.length).toBe(10);
		expect(state.reason).toBe('Study B was pushed away 3 times. 10 minutes now, then you decide.');
		expect(day.log.find((row) => row.type === 'pin')?.data).toEqual({ face: true });
	});

	test('the question comes after the ten minutes, with nothing else asked before', () => {
		const day = morning([], faced());
		expect(day.runTo(hm(10, 39)).check).toBeNull();
		expect(day.runTo(hm(10, 40)).check).toMatchObject({ about: 'face', todo: { id: 2 } });
	});

	test('an answer ends the count and the next session is an ordinary one', () => {
		const day = morning([], faced());
		day.runTo(hm(10, 40));
		day.faceAnswer(2, 'fine');
		const state = day.runTo(hm(10, 41));
		expect(state.current).toMatchObject({ kind: 'todo', face: false });
		expect(day.todos.find((todo) => todo.id === 2)?.skips).toBe(0);
	});

	test('unanswered it goes the way of any question: away', () => {
		const day = morning([], faced());
		expect(day.runTo(hm(10, 45)).current).toMatchObject({ kind: 'away', since: hm(10, 45) });
	});

	test('three skips on one day are not faced yet', () => {
		const todos = studies().map((todo) =>
			todo.id === 2 ? { ...todo, skips: 3, skipSince: '2026-10-14' } : todo
		);
		const day = morning([], todos);
		expect(day.runTo(hm(10, 31)).current).toMatchObject({ face: false });
	});

	test('"Do this now" is never faced, the user chose it', () => {
		const day = morning([], faced());
		day.runTo(hm(10, 31));
		day.choose(2);
		expect(day.runTo(hm(10, 32)).current).toMatchObject({
			kind: 'todo',
			todo: { id: 2 },
			face: false
		});
	});

	test('asking where Face it stops: a faced session still answers the check of the day', () => {
		const day = morning([lunch()], faced());
		day.diligent = true;
		day.runTo(hm(12));
		expect(kinds(day)).toContain('task');
	});
});

describe('the break that is offered', () => {
	const answerNow = (day: SimDay, extra: Record<string, unknown> = {}) => {
		const check = day.peek().check!;
		day.answer(check.todo!.id, {
			before: check.todo!.progress,
			after: check.todo!.progress,
			...extra
		});
	};

	test('after 90 minutes of work without a break the check offers one, once', () => {
		const day = new SimDay([], studies());
		day.diligent = false;
		day.jumpTo(hm(9));
		day.start();
		for (const minute of [hm(9, 15), hm(9, 45)]) {
			expect(day.runTo(minute).check).toMatchObject({ offerBreak: false });
			answerNow(day);
		}
		const check = day.runTo(hm(10, 30)).check;
		expect(check).toMatchObject({ about: 'progress', offerBreak: true });
		answerNow(day, { offered: true });
		expect(day.runTo(hm(11, 15)).check).toMatchObject({ offerBreak: false });
	});

	test('a break starts the 90 minutes again', () => {
		const day = new SimDay([], studies());
		day.diligent = false;
		day.jumpTo(hm(9));
		day.start();
		day.runTo(hm(9, 50));
		day.takeBreak(5, { why: 'asked' });
		day.runTo(hm(9, 55));
		day.back();
		day.diligent = true;
		day.runTo(hm(11, 20));
		const asked = day.timeline.filter(({ state }) => state.check?.offerBreak);
		expect(asked).toEqual([]);
	});
});

describe('what Call it a day costs', () => {
	test('a to-do that is behind its share says what stopping costs', () => {
		const day = morning();
		const state = day.runTo(hm(10, 35));
		expect(state.cost).toMatch(/^Study B is \d+ min behind today, tomorrow needs .+ for it\.$/);
		expect(heroFromFlow(state, hm(10, 35), at(hm(10, 35)))).toMatchObject({ cost: state.cost });
	});

	test('nothing to say when no to-do has a date', () => {
		const day = morning([], [simTodo(1, { dueDate: null })]);
		expect(day.runTo(hm(10, 35)).cost).toBeNull();
	});

	test('the other states have no cost', () => {
		const day = new SimDay([], studies());
		expect(day.runTo(hm(7, 30)).cost).toBeNull();
	});
});

describe('sessionTiming', () => {
	const min = (minutes: number) => minutes * 60_000;
	const dayEnd = min(23 * 60);

	test('with nothing coming: the check at the end, again after two minutes, away after five', () => {
		expect(sessionTiming(min(600), min(30), Infinity, dayEnd)).toEqual({
			end: min(630),
			dueAt: min(630),
			askAgainAt: min(632),
			awayAt: min(635),
			early: false
		});
	});

	test('an item that is already running holds the minutes: no check at all', () => {
		const timing = sessionTiming(min(600), min(30), min(600), dayEnd);
		expect(timing).toMatchObject({ end: min(600), dueAt: null, awayAt: null });
	});

	test.each([
		['the end of the session is before the get ready minutes', 600, 30, 660, 630, false],
		['the end falls inside the get ready minutes', 670, 15, 690, null, false],
		['the item comes before the end and the session is old enough', 600, 45, 640, 625, true],
		['the item comes before the end but the session just began', 620, 45, 640, null, false]
	])('%s', (_name, anchor, length, item, dueAt, early) => {
		const timing = sessionTiming(min(anchor), min(length), min(item), dayEnd);
		expect(timing.dueAt).toBe(dueAt === null ? null : min(dueAt));
		expect(timing.early).toBe(early);
	});

	test('away never comes after get ready begins', () => {
		// due at 630, item at 640: ready from 630, so no second ask and no away
		const timing = sessionTiming(min(600), min(30), min(640), dayEnd);
		expect(timing.askAgainAt).toBeNull();
		expect(timing.awayAt).toBeNull();
	});

	test('a session never runs into the night', () => {
		expect(sessionTiming(min(22 * 60 + 50), min(30), Infinity, dayEnd)).toMatchObject({
			end: dayEnd,
			dueAt: null
		});
	});
});
