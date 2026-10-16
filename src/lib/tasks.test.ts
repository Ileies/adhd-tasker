/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { addQuickTask, createTask, deleteTask, loadDay, updateTask } from '#lib/tasks.js';
import { dismissToast } from '#lib/toast.js';
import { tasker } from '#lib/app.svelte.js';
import { fakeFetch } from '#test/fakes.js';
import { Priority, TaskStatus, type Task } from '#lib/types.js';

const task = (id: number, patch: Partial<Task> = {}): Task => ({
	id,
	title: `Task ${id}`,
	description: '',
	date: '2026-10-14',
	startTime: 540 + id * 60,
	duration: 30,
	priority: Priority.Medium,
	status: TaskStatus.Pending,
	completedAt: null,
	kind: 'block',
	parentId: null,
	shift: 0,
	...patch
});

const rejected = (status: number, message: string) => () => Response.json({ message }, { status });
const offline = () => {
	throw new TypeError('fetch failed');
};

beforeEach(() => {
	tasker.tasks = [task(1), task(2), task(3)];
	dismissToast();
});
afterEach(() => dismissToast());

describe('updateTask', () => {
	test('shows the change at once and keeps it when the server accepts', async () => {
		const { requests } = fakeFetch({ 'PUT http://localhost:5173/edit': () => Response.json(true) });
		const pending = updateTask(task(2, { title: 'Renamed' }));
		expect(tasker.tasks[1].title).toBe('Renamed');
		expect(await pending).toBe(true);
		expect(tasker.tasks[1].title).toBe('Renamed');
		expect(tasker.toasts).toEqual([]);
		expect(await requests[0].json()).toMatchObject({ id: 2, title: 'Renamed' });
	});

	test('puts the task back and says why when the server answers 400 (D4)', async () => {
		fakeFetch({ 'PUT http://localhost:5173/edit': rejected(400, 'priority must be 1 to 5') });
		expect(await updateTask(task(2, { priority: 9 as Priority }))).toBe(false);
		expect(tasker.tasks[1]).toEqual(task(2));
		expect(tasker.toasts.at(-1)?.message).toContain('priority must be 1 to 5');
	});

	test('puts the task back when the network fails (D4)', async () => {
		fakeFetch({ 'PUT http://localhost:5173/edit': offline });
		expect(await updateTask(task(2, { startTime: 0 }))).toBe(false);
		expect(tasker.tasks[1]).toEqual(task(2));
		expect(tasker.toasts.at(-1)?.message).toContain('Could not');
	});

	test('a task the client does not hold is left alone', async () => {
		const { requests } = fakeFetch({});
		expect(await updateTask(task(9))).toBe(false);
		expect(requests).toEqual([]);
		expect(tasker.tasks).toHaveLength(3);
	});

	describe('an appointment', () => {
		const exam = (patch: Partial<Task> = {}) =>
			task(1, { kind: 'appointment', startTime: 720, ...patch });
		const travel = task(2, { kind: 'travel', parentId: 1, startTime: 665, duration: 45 });
		const routes = (dayAfter: Task[]) => ({
			'PUT http://localhost:5173/edit': () => Response.json(true),
			'GET http://localhost:5173/edit': () => Response.json(dayAfter),
			'GET http://localhost:5173/todos': () => Response.json([])
		});

		test('moving it reads the day and the to-dos again, its travel moved along on the server', async () => {
			tasker.tasks = [exam(), travel];
			const moved = { ...travel, startTime: 785 };
			const { requests } = fakeFetch(routes([exam({ startTime: 780 }), moved]));
			expect(await updateTask(exam({ startTime: 780 }))).toBe(true);
			expect(tasker.tasks.find((t) => t.id === 2)?.startTime).toBe(785);
			expect(
				requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)
			).toEqual(['PUT /edit', 'GET /edit', 'GET /todos']);
		});

		test('a change that moves nothing reads nothing again', async () => {
			tasker.tasks = [exam(), travel];
			const { requests } = fakeFetch(routes([]));
			await updateTask(exam({ title: 'Exam Math, room 4' }));
			expect(requests).toHaveLength(1);
		});

		test('a plain task moving reads nothing again', async () => {
			const { requests } = fakeFetch(routes([]));
			await updateTask(task(2, { startTime: 0 }));
			expect(requests).toHaveLength(1);
		});
	});
});

describe('deleteTask', () => {
	test('removes the task at once and keeps it gone when the server accepts', async () => {
		fakeFetch({ 'DELETE http://localhost:5173/edit': () => Response.json(true) });
		const pending = deleteTask(task(2));
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 3]);
		expect(await pending).toBe(true);
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 3]);
	});

	test('brings the task back in its place when the server answers 404 (D4)', async () => {
		fakeFetch({ 'DELETE http://localhost:5173/edit': rejected(404, 'Task not found') });
		expect(await deleteTask(task(2))).toBe(false);
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
		expect(tasker.toasts.at(-1)?.message).toContain('Task not found');
	});

	test('brings the task back when the network fails (D4)', async () => {
		fakeFetch({ 'DELETE http://localhost:5173/edit': offline });
		expect(await deleteTask(task(2))).toBe(false);
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
	});

	test('an appointment takes its travel with it at once and the to-dos are read again', async () => {
		const exam = task(1, { kind: 'appointment' });
		tasker.tasks = [exam, task(2, { kind: 'travel', parentId: 1 }), task(3)];
		const { requests } = fakeFetch({
			'DELETE http://localhost:5173/edit': () => Response.json(true),
			'GET http://localhost:5173/edit': () => Response.json([task(3)]),
			'GET http://localhost:5173/todos': () => Response.json([])
		});
		const pending = deleteTask(exam);
		expect(tasker.tasks.map((t) => t.id)).toEqual([3]);
		expect(await pending).toBe(true);
		expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
			'/edit',
			'/edit',
			'/todos'
		]);
	});
});

describe('createTask', () => {
	const { id: _id, ...input } = task(4);

	test('adds the row the server answers with', async () => {
		fakeFetch({ 'POST http://localhost:5173/edit': () => Response.json(task(4)) });
		expect(await createTask(input)).toMatchObject({ id: 4 });
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 2, 3, 4]);
	});

	test('throws with the reason and adds nothing when the server answers 400', async () => {
		fakeFetch({ 'POST http://localhost:5173/edit': rejected(400, 'title is required') });
		const failure = await createTask(input).catch((error: Error) => error);
		expect((failure as Error).message).toContain('title is required');
		expect(tasker.tasks).toHaveLength(3);
	});
});

describe('addQuickTask', () => {
	test('adds the task and says what was added and when', async () => {
		fakeFetch({
			'POST http://localhost:5173/edit': async (request) =>
				Response.json({ ...(await request.json()), id: 9, status: 'pending' })
		});
		expect(await addQuickTask('Call dentist 14:30', '2026-10-14', null)).toMatchObject({ id: 9 });
		expect(tasker.tasks.at(-1)).toMatchObject({ id: 9, title: 'Call dentist', startTime: 870 });
		expect(tasker.toasts.at(-1)?.message).toBe('Added Call dentist at 14:30');
	});

	test('a line with an appointment word is sent as an appointment, the chip decides otherwise', async () => {
		const sent: unknown[] = [];
		fakeFetch({
			'POST http://localhost:5173/edit': async (request) => {
				const body = await request.json();
				sent.push(body);
				return Response.json({ ...body, id: 9, status: 'pending' });
			}
		});
		expect(await addQuickTask('Exam Math 12:00', '2026-10-14', null)).toMatchObject({
			kind: 'appointment'
		});
		await addQuickTask('Exam Math 12:00', '2026-10-14', null, '2026-10-14', 'block');
		expect(sent).toMatchObject([{ kind: 'appointment' }, { kind: 'block' }]);
	});

	test('says why when the task could not be added', async () => {
		fakeFetch({ 'POST http://localhost:5173/edit': rejected(400, 'title is required') });
		expect(await addQuickTask('Call dentist', '2026-10-14', null)).toBeNull();
		expect(tasker.toasts.at(-1)?.message).toContain('title is required');
		expect(tasker.tasks).toHaveLength(3);
	});

	test('a line without a title adds nothing and shows nothing', async () => {
		expect(await addQuickTask('  ', '2026-10-14', null)).toBeNull();
		expect(tasker.toasts).toEqual([]);
	});
});

describe('loadDay', () => {
	test('replaces only that day', async () => {
		tasker.tasks = [task(1), task(2, { date: '2026-10-15' })];
		fakeFetch({ 'http://localhost:5173/edit': () => Response.json([task(3)]) });
		await loadDay('2026-10-14');
		expect(tasker.tasks.map((t) => t.id).sort()).toEqual([2, 3]);
	});

	test('throws and keeps the plan when the server fails', async () => {
		fakeFetch({ 'http://localhost:5173/edit': rejected(500, 'boom') });
		const failure = await loadDay('2026-10-14').catch((error: Error) => error);
		expect(failure).toBeInstanceOf(Error);
		expect(tasker.tasks).toHaveLength(3);
	});

	test('says why when the server answers 401', async () => {
		fakeFetch({ 'http://localhost:5173/edit': rejected(401, 'Not signed in') });
		const failure = await loadDay('2026-10-14').catch((error: Error) => error);
		expect((failure as Error).message).toContain('Not signed in');
	});

	test('says why when the network fails', async () => {
		fakeFetch({ 'http://localhost:5173/edit': offline });
		const failure = await loadDay('2026-10-14').catch((error: Error) => error);
		expect((failure as Error).message).toContain('no connection');
	});
});
