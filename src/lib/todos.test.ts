/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import type { FlowRow, Todo } from '#lib/core/repo.js';
import {
	addQuickLine,
	addTodo,
	answerCheck,
	answerFace,
	changeTodo,
	chooseTodo,
	dropTodo,
	endBreak,
	finishTodo,
	flowToday,
	loadFlow,
	loadTodos,
	recordAnswer,
	removeTodo,
	struggleOn,
	takeBreak
} from '#lib/todos.js';
import { dismissToast } from '#lib/toast.js';
import { Priority } from '#lib/types.js';
import { fakeFetch } from '#test/fakes.js';

const todo = (id: number, patch: Partial<Todo> = {}): Todo => ({
	id,
	title: `To-do ${id}`,
	description: '',
	priority: Priority.Medium,
	status: 'open',
	estimate: null,
	learned: false,
	progress: 0,
	spentMinutes: 0,
	skips: 0,
	skipSince: null,
	dueDate: null,
	dueTime: null,
	parentId: null,
	notBefore: null,
	nextStep: null,
	createdAt: 1,
	completedAt: null,
	...patch
});

const row = (id: number, patch: Partial<FlowRow> = {}): FlowRow => ({
	id,
	at: 1,
	date: '2026-10-14',
	type: 'rest',
	todoId: null,
	taskId: null,
	data: {},
	key: null,
	...patch
});

const rejected = (status: number, message: string) => () => Response.json({ message }, { status });
const offline = () => {
	throw new TypeError('fetch failed');
};
const BASE = 'http://localhost:5173';

beforeEach(() => {
	setSystemTime(new Date('2026-10-14T09:00:00Z'));
	tasker.timezone = 'UTC';
	tasker.todos = [todo(1), todo(2), todo(3)];
	tasker.flow = { date: '2026-10-14', rows: [] };
	dismissToast();
});
afterEach(() => {
	setSystemTime();
	tasker.timezone = null;
	dismissToast();
});

describe('loadTodos and addTodo', () => {
	test('loading replaces what the client holds', async () => {
		fakeFetch({ [`GET ${BASE}/todos`]: () => Response.json([todo(7)]) });
		await loadTodos();
		expect(tasker.todos.map((entry) => entry.id)).toEqual([7]);
	});

	test('a failed load says why', async () => {
		fakeFetch({ [`GET ${BASE}/todos`]: offline });
		expect(loadTodos()).rejects.toThrow('no connection');
	});

	test('a new to-do is appended, once', async () => {
		fakeFetch({ [`POST ${BASE}/todos`]: () => Response.json(todo(9)) });
		await addTodo({ title: 'x' });
		expect(tasker.todos.map((entry) => entry.id)).toEqual([1, 2, 3, 9]);
	});

	test('a refusal rejects with the reason and adds nothing', async () => {
		fakeFetch({ [`POST ${BASE}/todos`]: rejected(400, 'title is required') });
		expect(addTodo({})).rejects.toThrow('title is required');
		expect(tasker.todos).toHaveLength(3);
	});
});

describe('addQuickLine', () => {
	test('a line without a time makes a to-do with its size and due date', async () => {
		let sent: unknown = null;
		fakeFetch({
			[`POST ${BASE}/todos`]: async (request) => {
				sent = await request.json();
				return Response.json(todo(9, { title: 'Study Math' }));
			}
		});
		const made = await addQuickLine('Study Math 10h by Nov 5', '2026-10-14', 540);
		expect(made).toMatchObject({ kind: 'todo', todo: { id: 9 } });
		expect(sent).toMatchObject({ title: 'Study Math', estimate: 600, dueDate: '2026-11-05' });
		expect(tasker.toasts.at(-1)?.message).toBe('Added Study Math, due Thu, Nov 5');
	});

	test('a line with a time makes a task at a time and no to-do', async () => {
		fakeFetch({
			[`POST ${BASE}/edit`]: async (request) =>
				Response.json({ ...(await request.json()), id: 4, status: 'pending' })
		});
		expect(await addQuickLine('Call dentist 14:30', '2026-10-14', 540)).toEqual({ kind: 'task' });
		expect(tasker.todos).toHaveLength(3);
	});

	test('a line without a title makes nothing and says nothing', async () => {
		expect(await addQuickLine('2h', '2026-10-14', 540)).toBeNull();
		expect(tasker.toasts).toEqual([]);
	});

	test('a refusal says why', async () => {
		fakeFetch({ [`POST ${BASE}/todos`]: rejected(400, 'title is required') });
		expect(await addQuickLine('Study', '2026-10-14', 540)).toBeNull();
		expect(tasker.toasts.at(-1)?.message).toContain('title is required');
	});
});

describe('changeTodo', () => {
	test('shows the change at once, done fills the bar, then takes the stored to-do', async () => {
		fakeFetch({
			[`PUT ${BASE}/todos`]: () =>
				Response.json(todo(2, { status: 'done', progress: 100, completedAt: 5 }))
		});
		const pending = changeTodo({ id: 2, status: 'done' });
		expect(tasker.todos[1]).toMatchObject({ status: 'done', progress: 100 });
		expect(await pending).toBe(true);
		expect(tasker.todos[1].completedAt).toBe(5);
	});

	test('puts the to-do back and says why when the backend refuses', async () => {
		fakeFetch({ [`PUT ${BASE}/todos`]: rejected(400, 'estimate must be a number') });
		expect(await changeTodo({ id: 2, title: 'Renamed' })).toBe(false);
		expect(tasker.todos[1]).toEqual(todo(2));
		expect(tasker.toasts.at(-1)?.message).toContain('estimate must be a number');
	});

	test('a to-do the client does not hold is left alone', async () => {
		const { requests } = fakeFetch({});
		expect(await changeTodo({ id: 9, title: 'x' })).toBe(false);
		expect(requests).toEqual([]);
	});
});

describe('finishTodo, dropTodo and chooseTodo', () => {
	const changes = () => {
		const sent: unknown[] = [];
		fakeFetch({
			[`PUT ${BASE}/todos`]: async (request) => {
				const body = (await request.json()) as { id: number };
				sent.push(body);
				return Response.json(todo(body.id, body as Partial<Todo>));
			}
		});
		return sent;
	};

	test('Done marks the to-do done at once and the Undo puts back status and progress', async () => {
		const sent = changes();
		tasker.todos = [todo(1, { progress: 40 })];
		const onUndo = () => sent.push('undo');
		finishTodo(tasker.todos[0], onUndo);
		expect(tasker.todos[0]).toMatchObject({ status: 'done', progress: 100 });
		expect(tasker.toasts.at(-1)?.message).toBe('Done: To-do 1');
		await tasker.toasts.at(-1)?.undo?.();
		expect(sent).toContainEqual({ id: 1, status: 'open', progress: 40 });
		expect(sent).toContain('undo');
	});

	test('Drop drops the to-do and the Undo reopens it', async () => {
		const sent = changes();
		tasker.todos = [todo(1)];
		dropTodo(tasker.todos[0]);
		expect(tasker.todos[0].status).toBe('dropped');
		expect(tasker.toasts.at(-1)?.message).toBe('Dropped: To-do 1');
		await tasker.toasts.at(-1)?.undo?.();
		expect(sent.at(-1)).toEqual({ id: 1, status: 'open' });
	});

	test('Do this now logs a choose answer for the to-do', async () => {
		let sent: unknown = null;
		fakeFetch({
			[`POST ${BASE}/flow`]: async (request) => {
				sent = await request.json();
				return Response.json(row(5, { type: 'choose', todoId: 2 }));
			}
		});
		await chooseTodo(todo(2));
		expect(sent).toMatchObject({ type: 'choose', todoId: 2 });
	});
});

describe('removeTodo', () => {
	test('removes the to-do at once and keeps it gone', async () => {
		fakeFetch({ [`DELETE ${BASE}/todos`]: () => Response.json(true) });
		const pending = removeTodo(todo(2));
		expect(tasker.todos.map((entry) => entry.id)).toEqual([1, 3]);
		expect(await pending).toBe(true);
	});

	test('brings it back in its place when the backend refuses', async () => {
		fakeFetch({ [`DELETE ${BASE}/todos`]: rejected(404, 'To-do not found') });
		expect(await removeTodo(todo(2))).toBe(false);
		expect(tasker.todos.map((entry) => entry.id)).toEqual([1, 2, 3]);
		expect(tasker.toasts.at(-1)?.message).toContain('To-do not found');
	});
});

describe('the flow log', () => {
	test('today follows the timezone of the user', () => {
		setSystemTime(new Date('2026-10-14T15:00:00Z'));
		tasker.timezone = 'Pacific/Auckland';
		expect(flowToday()).toBe('2026-10-15');
	});

	test('loading keeps the rows with their day', async () => {
		const { requests } = fakeFetch({ [`GET ${BASE}/flow`]: () => Response.json([row(4)]) });
		await loadFlow();
		expect(tasker.flow).toEqual({ date: '2026-10-14', rows: [row(4)] });
		expect(new URL(requests[0].url).search).toBe('?date=2026-10-14');
	});

	test('an answer shows at once with a temporary id, then becomes the stored row', async () => {
		fakeFetch({ [`POST ${BASE}/flow`]: () => Response.json(row(5, { type: 'start' })) });
		const pending = recordAnswer({ type: 'start' });
		expect(tasker.flow.rows).toHaveLength(1);
		expect(tasker.flow.rows[0].id).toBeLessThan(0);
		expect(await pending).toMatchObject({ id: 5 });
		expect(tasker.flow.rows.map((entry) => entry.id)).toEqual([5]);
	});

	test('the answer carries this device clock to the backend', async () => {
		const { requests } = fakeFetch({ [`POST ${BASE}/flow`]: () => Response.json(row(5)) });
		await recordAnswer({ type: 'rest' });
		expect(await requests[0].json()).toEqual({
			type: 'rest',
			at: Date.parse('2026-10-14T09:00:00Z')
		});
	});

	test('a key logged already leaves one row only', async () => {
		tasker.flow.rows = [row(5, { type: 'pin', key: 'pin:1' })];
		fakeFetch({ [`POST ${BASE}/flow`]: () => Response.json(null) });
		expect(await recordAnswer({ type: 'pin', key: 'pin:1' })).toBeNull();
		expect(tasker.flow.rows.map((entry) => entry.id)).toEqual([5]);
	});

	test('a refused answer disappears and a toast says why', async () => {
		fakeFetch({ [`POST ${BASE}/flow`]: rejected(400, 'type must be a flow answer') });
		expect(await recordAnswer({ type: 'rest' })).toBeNull();
		expect(tasker.flow.rows).toEqual([]);
		expect(tasker.toasts.at(-1)?.message).toContain('type must be a flow answer');
	});

	test('a day that rolled over starts with no rows', async () => {
		tasker.flow = { date: '2026-10-13', rows: [row(1, { date: '2026-10-13' })] };
		fakeFetch({ [`POST ${BASE}/flow`]: offline });
		await recordAnswer({ type: 'rest' });
		expect(tasker.flow).toEqual({ date: '2026-10-14', rows: [] });
	});
});

describe('answering a check', () => {
	const answer = { before: 0, after: 20, minutes: 30 };

	beforeEach(() => {
		tasker.todos = [todo(1, { estimate: 300 })];
	});

	test('the to-do shows the new progress and time at once, the row goes to the log', async () => {
		const { requests } = fakeFetch({
			[`POST ${BASE}/flow`]: () => Response.json(row(7, { type: 'check' }))
		});
		const pending = answerCheck(tasker.todos[0], answer);
		expect(tasker.todos[0]).toMatchObject({ progress: 20, spentMinutes: 30 });
		expect(await pending).toMatchObject({ id: 7 });
		expect(await requests[0].json()).toMatchObject({
			type: 'check',
			todoId: 1,
			data: { ...answer, slow: false }
		});
	});

	test('the pace is worked out for the log before the server does it again', async () => {
		const { requests } = fakeFetch({ [`POST ${BASE}/flow`]: () => Response.json(row(7)) });
		await answerCheck(tasker.todos[0], { before: 0, after: 0, minutes: 30 });
		expect((await requests[0].json()).data.slow).toBe(true);
	});

	test('Keep going is never slow', async () => {
		const { requests } = fakeFetch({ [`POST ${BASE}/flow`]: () => Response.json(row(7)) });
		await answerCheck(tasker.todos[0], { before: 0, after: 0, minutes: 30, keep: true });
		expect((await requests[0].json()).data.slow).toBe(false);
		expect(tasker.todos[0].progress).toBe(0);
	});

	test('a refused answer puts the to-do back', async () => {
		fakeFetch({ [`POST ${BASE}/flow`]: rejected(404, 'To-do not found') });
		expect(await answerCheck(tasker.todos[0], answer)).toBeNull();
		expect(tasker.todos[0]).toMatchObject({ progress: 0, spentMinutes: 0 });
	});
});

describe('the ladder on the client', () => {
	const options = { sessionStart: Date.now() - 20 * 60_000, breakMinutes: 10, activity: 'water' };
	/** Answers every POST with the body it got, as the next row. */
	const echo = () => {
		let id = 100;
		return fakeFetch({
			[`POST ${BASE}/flow`]: async (request: Request) => {
				const body = await request.json();
				return Response.json(row(id++, { at: body.at ?? Date.now(), ...body }));
			}
		});
	};
	const sent = async (requests: Request[]) =>
		Promise.all(requests.map(async (request) => (await request.clone().json()) as FlowRow));

	test('"I couldn\'t focus" writes the check and then a rotation a moment later', async () => {
		const { requests } = echo();
		await answerCheck(
			tasker.todos[0],
			{ before: 0, after: 0, minutes: 30, pace: 'unfocused' },
			options
		);
		const rows = await sent(requests);
		expect(rows.map((entry) => entry.type)).toEqual(['check', 'rotate']);
		expect(rows[1].data).toEqual({ why: 'unfocused' });
		expect(rows[1].at).toBeGreaterThan(rows[0].at ?? 0);
		expect(tasker.todos[0]).toMatchObject({ skips: 1, skipSince: '2026-10-14' });
		expect(tasker.toasts.at(-1)?.message).toBe('Switched. To-do 1 comes back later.');
	});

	test('any other answer writes only the check', async () => {
		const { requests } = echo();
		await answerCheck(tasker.todos[0], { before: 0, after: 10, minutes: 30 }, options);
		expect((await sent(requests)).map((entry) => entry.type)).toEqual(['check']);
	});

	test('with nothing else to go to the ladder gives a break', async () => {
		tasker.todos = [tasker.todos[0]];
		const { requests } = echo();
		await answerCheck(
			tasker.todos[0],
			{ before: 0, after: 0, minutes: 30, pace: 'unfocused' },
			options
		);
		const rows = await sent(requests);
		expect(rows[1]).toMatchObject({
			type: 'break',
			data: { minutes: 10, activity: 'water', why: 'unfocused' }
		});
		expect(tasker.toasts.at(-1)?.message).toBe('Break for 10 min.');
	});

	test('"Something else" in the first minutes is held and says nothing in a toast', async () => {
		const { requests } = echo();
		const plan = await struggleOn(tasker.todos[0], 'else', {
			...options,
			sessionStart: Date.now() - 60_000
		});
		expect(plan).toMatchObject({ step: 'rotate', hold: true });
		expect((await sent(requests))[0].data).toEqual({ why: 'else', after: 300_000 });
		expect(tasker.toasts).toEqual([]);
	});

	test('the first "I cannot get started" only logs the tap, the second is a struggle', async () => {
		const { requests } = echo();
		expect(await struggleOn(tasker.todos[0], 'cant-start', options)).toBeNull();
		tasker.flow.rows = tasker.flow.rows.map((entry) => ({ ...entry, id: Math.abs(entry.id) }));
		expect(await struggleOn(tasker.todos[0], 'cant-start', options)).toMatchObject({
			step: 'rotate'
		});
		expect((await sent(requests)).map((entry) => entry.type)).toEqual(['stuck', 'stuck', 'rotate']);
	});

	test('Undo on the toast takes the rotation back and gives the skip back', async () => {
		const { requests } = echo();
		await struggleOn(tasker.todos[0], 'else', { ...options, sessionStart: 0 });
		expect(tasker.todos[0].skips).toBe(1);
		const toast = tasker.toasts.at(-1)!;
		fakeFetch({
			[`POST ${BASE}/flow`]: () => Response.json(row(300, { type: 'undo' })),
			[`PUT ${BASE}/todos`]: async (request: Request) =>
				Response.json({ ...tasker.todos[0], ...(await request.json()) })
		});
		await toast.undo!();
		expect(tasker.todos[0]).toMatchObject({ skips: 0, skipSince: null });
		expect(requests.length).toBeGreaterThan(0);
	});

	test('a refused rotation puts the skip back', async () => {
		fakeFetch({ [`POST ${BASE}/flow`]: rejected(404, 'To-do not found') });
		await struggleOn(tasker.todos[0], 'else', { ...options, sessionStart: 0 });
		expect(tasker.todos[0].skips).toBe(0);
	});

	test('a break and "I\'m back" are plain answers', async () => {
		const { requests } = echo();
		await takeBreak(10, 'window');
		await endBreak();
		const rows = await sent(requests);
		expect(rows[0]).toMatchObject({
			type: 'break',
			data: { minutes: 10, activity: 'window', why: 'asked' }
		});
		expect(rows[1].type).toBe('back');
	});

	test('a Face it answer ends the count at once', async () => {
		tasker.todos = [todo(1, { skips: 3, skipSince: '2026-10-12' })];
		const { requests } = echo();
		await answerFace(tasker.todos[0], 'fine');
		expect(tasker.todos[0]).toMatchObject({ skips: 0, skipSince: null });
		expect((await sent(requests))[0]).toMatchObject({ type: 'face', data: { answer: 'fine' } });
	});

	test('a refused Face it answer puts the count back', async () => {
		tasker.todos = [todo(1, { skips: 3, skipSince: '2026-10-12' })];
		fakeFetch({ [`POST ${BASE}/flow`]: rejected(404, 'To-do not found') });
		await answerFace(tasker.todos[0], 'fine');
		expect(tasker.todos[0]).toMatchObject({ skips: 3, skipSince: '2026-10-12' });
	});
});
