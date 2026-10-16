/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import type { Task, Todo } from '#lib/core/repo.js';
import { addPreparation, dropTask } from '#lib/prepare.js';
import { dismissToast } from '#lib/toast.js';
import { Priority, TaskStatus } from '#lib/types.js';
import { fakeFetch } from '#test/fakes.js';

const BASE = 'http://localhost:5173';

const exam: Task = {
	id: 7,
	title: 'Exam Math',
	description: '',
	date: '2026-11-05',
	startTime: 12 * 60,
	duration: 120,
	priority: Priority.Critical,
	status: TaskStatus.Pending,
	completedAt: null,
	kind: 'appointment',
	parentId: null,
	shift: 0,
	routineId: null
};
const travel: Task = {
	...exam,
	id: 8,
	title: 'Travel to Exam Math',
	startTime: 11 * 60 + 5,
	duration: 45,
	kind: 'travel',
	parentId: 7
};
const prep: Todo = {
	id: 30,
	title: 'Prepare: Exam Math',
	description: 'chapters 1 to 4',
	priority: Priority.Critical,
	status: 'open',
	estimate: 600,
	learned: false,
	progress: 20,
	spentMinutes: 0,
	skips: 0,
	skipSince: null,
	dueDate: '2026-11-05',
	dueTime: 665,
	parentId: 7,
	notBefore: null,
	nextStep: null,
	createdAt: 1,
	completedAt: null
};

beforeEach(() => {
	tasker.tasks = [];
	tasker.todos = [];
	dismissToast();
});
afterEach(() => dismissToast());

describe('addPreparation', () => {
	test('makes the travel and the to-dos the sheet asked for and says so with an Undo', async () => {
		const sent: { path: string; body: Record<string, unknown> }[] = [];
		let next = 100;
		fakeFetch({
			[`POST ${BASE}/edit`]: async (request) => {
				const body = await request.json();
				sent.push({ path: '/edit', body });
				return Response.json({ ...body, id: next++, status: 'pending', completedAt: null });
			},
			[`POST ${BASE}/todos`]: async (request) => {
				const body = await request.json();
				sent.push({ path: '/todos', body });
				return Response.json({ ...prep, ...body, id: next++ });
			}
		});
		expect(await addPreparation(exam, { travel: 45, prepare: 600, steps: [] })).toBe(true);
		expect(sent.map((entry) => entry.path)).toEqual(['/edit', '/todos']);
		expect(sent[0].body).toMatchObject({ kind: 'travel', parentId: 7, startTime: 665 });
		expect(sent[1].body).toMatchObject({
			title: 'Prepare: Exam Math',
			parentId: 7,
			dueDate: '2026-11-05',
			dueTime: 665
		});
		expect(tasker.tasks).toHaveLength(1);
		expect(tasker.todos).toHaveLength(1);
		const toast = tasker.toasts.at(-1)!;
		expect(toast.message).toBe('Added travel and 1 to-do for Exam Math');
		expect(toast.undo).toBeDefined();
	});

	test('Undo takes both away again', async () => {
		fakeFetch({
			[`POST ${BASE}/edit`]: async (request) =>
				Response.json({ ...(await request.json()), id: 100, status: 'pending', completedAt: null }),
			[`POST ${BASE}/todos`]: async (request) =>
				Response.json({ ...prep, ...(await request.json()), id: 101 }),
			[`DELETE ${BASE}/edit`]: () => Response.json(true),
			[`GET ${BASE}/edit`]: () => Response.json([]),
			[`GET ${BASE}/todos`]: () => Response.json([]),
			[`DELETE ${BASE}/todos`]: () => Response.json(true)
		});
		await addPreparation(exam, { travel: 45, prepare: 600, steps: [] });
		await tasker.toasts.at(-1)!.undo!();
		expect(tasker.tasks).toEqual([]);
		expect(tasker.todos).toEqual([]);
	});

	test('travel that does not fit is said, and the rest is still added', async () => {
		fakeFetch({
			[`POST ${BASE}/todos`]: async (request) =>
				Response.json({ ...prep, ...(await request.json()), id: 101 })
		});
		const early = { ...exam, startTime: 12 };
		expect(await addPreparation(early, { travel: 45, prepare: 60, steps: [] })).toBe(true);
		expect(tasker.toasts.at(-1)?.message).toBe(
			'Added 1 to-do for Exam Math. There is no room before it for that much travel'
		);
	});

	test('an empty sheet adds nothing and says nothing', async () => {
		const { requests } = fakeFetch({});
		expect(await addPreparation(exam, { travel: null, prepare: null, steps: [] })).toBe(false);
		expect(requests).toEqual([]);
		expect(tasker.toasts).toEqual([]);
	});

	test('a refusal says why', async () => {
		fakeFetch({
			[`POST ${BASE}/edit`]: () =>
				Response.json({ message: 'That appointment has its travel already' }, { status: 400 })
		});
		expect(await addPreparation(exam, { travel: 45, prepare: null, steps: [] })).toBe(false);
		expect(tasker.toasts.at(-1)?.message).toContain('has its travel already');
	});
});

describe('dropTask', () => {
	test('a task of the user is deleted with an Undo that makes it again', async () => {
		const mine = { ...exam, id: 5, kind: 'block' as const, title: 'Write intro' };
		tasker.tasks = [mine];
		const { requests } = fakeFetch({
			[`DELETE ${BASE}/edit`]: () => Response.json(true),
			[`POST ${BASE}/edit`]: async (request) =>
				Response.json({ ...(await request.json()), id: 6, status: 'pending', completedAt: null })
		});
		expect(await dropTask(mine)).toBe(true);
		expect(tasker.toasts.at(-1)?.message).toBe('Deleted: Write intro');
		await tasker.toasts.at(-1)!.undo!();
		expect(tasker.tasks.map((task) => task.id)).toEqual([6]);
		expect(requests.map((request) => request.method)).toEqual(['DELETE', 'POST']);
	});

	test('an appointment comes back with its travel and its preparation', async () => {
		tasker.tasks = [exam, travel];
		tasker.todos = [prep];
		const made: { path: string; body: Record<string, unknown> }[] = [];
		let next = 50;
		fakeFetch({
			[`DELETE ${BASE}/edit`]: () => Response.json(true),
			[`GET ${BASE}/edit`]: () => Response.json([]),
			[`GET ${BASE}/todos`]: () => Response.json([{ ...prep, parentId: null }]),
			[`POST ${BASE}/edit`]: async (request) => {
				const body = await request.json();
				made.push({ path: '/edit', body });
				return Response.json({ ...body, id: next++, status: 'pending', completedAt: null });
			},
			[`PUT ${BASE}/todos`]: async (request) => {
				const body = await request.json();
				made.push({ path: '/todos', body });
				return Response.json({ ...prep, ...body });
			}
		});
		expect(await dropTask(exam)).toBe(true);
		await tasker.toasts.at(-1)!.undo!();
		expect(made).toMatchObject([
			{ path: '/edit', body: { title: 'Exam Math', kind: 'appointment' } },
			{ path: '/edit', body: { title: 'Travel to Exam Math', kind: 'travel', parentId: 50 } },
			{ path: '/todos', body: { id: 30, parentId: 50, description: 'chapters 1 to 4' } }
		]);
	});

	test('a refused delete says why and offers no Undo', async () => {
		tasker.tasks = [exam];
		fakeFetch({
			[`DELETE ${BASE}/edit`]: () => Response.json({ message: 'Task not found' }, { status: 404 }),
			[`GET ${BASE}/edit`]: () => Response.json([exam]),
			[`GET ${BASE}/todos`]: () => Response.json([])
		});
		expect(await dropTask(exam)).toBe(false);
		expect(tasker.toasts.at(-1)?.undo).toBeUndefined();
		expect(tasker.toasts.map((toast) => toast.message)).toEqual([
			expect.stringContaining('Could not delete')
		]);
	});
});
