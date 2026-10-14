/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createTask, deleteTask, loadDay, updateTask } from '#lib/tasks.js';
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
afterEach(dismissToast);

describe('updateTask', () => {
	test('shows the change at once and keeps it when the server accepts', async () => {
		const { requests } = fakeFetch({ 'PUT http://localhost:5173/edit': () => Response.json(true) });
		const pending = updateTask(task(2, { title: 'Renamed' }));
		expect(tasker.tasks[1].title).toBe('Renamed');
		expect(await pending).toBe(true);
		expect(tasker.tasks[1].title).toBe('Renamed');
		expect(tasker.toast).toBeNull();
		expect(await requests[0].json()).toMatchObject({ id: 2, title: 'Renamed' });
	});

	test('puts the task back and says why when the server answers 400 (D4)', async () => {
		fakeFetch({ 'PUT http://localhost:5173/edit': rejected(400, 'priority must be 1 to 5') });
		expect(await updateTask(task(2, { priority: 9 as Priority }))).toBe(false);
		expect(tasker.tasks[1]).toEqual(task(2));
		expect(tasker.toast?.message).toContain('priority must be 1 to 5');
	});

	test('puts the task back when the network fails (D4)', async () => {
		fakeFetch({ 'PUT http://localhost:5173/edit': offline });
		expect(await updateTask(task(2, { startTime: 0 }))).toBe(false);
		expect(tasker.tasks[1]).toEqual(task(2));
		expect(tasker.toast?.message).toContain('Could not');
	});

	test('a task the client does not hold is left alone', async () => {
		const { requests } = fakeFetch({});
		expect(await updateTask(task(9))).toBe(false);
		expect(requests).toEqual([]);
		expect(tasker.tasks).toHaveLength(3);
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
		expect(tasker.toast?.message).toContain('Task not found');
	});

	test('brings the task back when the network fails (D4)', async () => {
		fakeFetch({ 'DELETE http://localhost:5173/edit': offline });
		expect(await deleteTask(task(2))).toBe(false);
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
	});
});

describe('createTask', () => {
	const { id: _id, ...input } = task(4);

	test('adds the row the server answers with', async () => {
		fakeFetch({ 'POST http://localhost:5173/edit': () => Response.json(task(4)) });
		await createTask(input);
		expect(tasker.tasks.map((t) => t.id)).toEqual([1, 2, 3, 4]);
	});

	test('throws with the reason and adds nothing when the server answers 400', async () => {
		fakeFetch({ 'POST http://localhost:5173/edit': rejected(400, 'title is required') });
		const failure = await createTask(input).catch((error: Error) => error);
		expect((failure as Error).message).toContain('title is required');
		expect(tasker.tasks).toHaveLength(3);
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
