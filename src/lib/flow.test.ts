/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	currentKey,
	currentTitle,
	pinKey,
	pinStart,
	READY_MINUTES,
	SESSION_MINUTES,
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
		expect(state.current).toEqual({ kind: 'away', since: null });
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
		expect(state.pin).toEqual({ key: pinKey(at(hm(9))), todoId: 2 });
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

	test('the next session starts after its length and is pinned again', () => {
		const day = started();
		day.runTo(hm(9, SESSION_MINUTES));
		const state = day.peek();
		if (state.current.kind !== 'todo') throw new Error('expected a to-do');
		expect(state.current.session.start).toBe(at(hm(9, SESSION_MINUTES)));
		expect(day.log.filter((row) => row.type === 'pin').map((row) => row.key)).toEqual([
			pinKey(at(hm(9))),
			pinKey(at(hm(9, SESSION_MINUTES)))
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
		day.runTo(hm(9, 5 + SESSION_MINUTES));
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
		expect(day.runTo(hm(9, 2)).current).toEqual({ kind: 'away', since: null });
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
		day.runTo(hm(9, SESSION_MINUTES - 1), (_minute, state) => {
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
		[{ kind: 'todo', todo, session }, 'Study B'],
		[{ kind: 'ready', next: task }, null],
		[{ kind: 'away', since: null }, null],
		[{ kind: 'plan' }, null],
		[{ kind: 'rest', why: 'night' }, null]
	] as const)('%j has the title %p', (current, title) => {
		expect(currentTitle(current as never)).toBe(title);
	});

	test('a to-do says why it was picked, every other state has its own line', () => {
		expect(switchLine({ current: { kind: 'todo', todo, session }, reason: 'Due today' })).toBe(
			'Due today'
		);
		expect(switchLine({ current: { kind: 'todo', todo, session }, reason: null })).toBe(
			'The next session started'
		);
		const lines = [
			{ kind: 'task', task, left: 1, wrapping: false },
			{ kind: 'time-up', ended: task, over: 1, current: null },
			{ kind: 'ready', next: task },
			{ kind: 'away', since: null },
			{ kind: 'plan' },
			{ kind: 'rest', why: 'night' },
			{ kind: 'rest', why: 'called' }
		].map((current) => switchLine({ current: current as never, reason: null }));
		expect(new Set(lines).size).toBe(lines.length);
	});
});
