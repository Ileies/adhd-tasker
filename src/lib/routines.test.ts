/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import type { Routine, Task } from '#lib/core/repo.js';
import {
	addRoutine,
	changeRoutine,
	loadRoutineDays,
	loadRoutines,
	reloadRoutines,
	removeRoutine,
	undoPatch
} from '#lib/routines.js';
import { dismissToast } from '#lib/toast.js';
import { Priority, TaskStatus } from '#lib/types.js';
import { fakeFetch } from '#test/fakes.js';

const BASE = 'http://localhost:5173';

const routine = (id: number, patch: Partial<Routine> = {}): Routine => ({
	id,
	title: `Routine ${id}`,
	description: '',
	priority: Priority.Medium,
	startTime: 720,
	duration: 45,
	shift: 0,
	kind: 'block',
	repeat: 'daily',
	firstDay: '2026-10-14',
	lastDay: null,
	through: '2026-10-27',
	...patch
});

const task = (id: number, date: string): Task => ({
	id,
	title: 'Lunch',
	description: '',
	date,
	startTime: 720,
	duration: 45,
	priority: Priority.Medium,
	status: TaskStatus.Pending,
	completedAt: null,
	kind: 'block',
	parentId: null,
	shift: 0,
	routineId: 1
});

const rejected = (status: number, message: string) => () => Response.json({ message }, { status });

/** The toast that is showing, its Undo run. */
const undo = () => tasker.toasts.at(-1)!.undo!();

beforeEach(() => {
	setSystemTime(new Date('2026-10-14T09:00:00Z'));
	tasker.timezone = 'UTC';
	tasker.routines = [routine(1)];
	// An old day the Plan screen fetched itself, and today
	tasker.tasks = [task(10, '2026-10-01'), task(11, '2026-10-14')];
	dismissToast();
});
afterEach(() => {
	setSystemTime();
	tasker.timezone = null;
	tasker.routines = [];
	tasker.tasks = [];
	dismissToast();
});

describe('loadRoutines', () => {
	test('replaces what the client holds', async () => {
		fakeFetch({ [`GET ${BASE}/routines`]: () => Response.json([routine(7)]) });
		await loadRoutines();
		expect(tasker.routines.map((entry) => entry.id)).toEqual([7]);
	});

	test('a failed load says why', async () => {
		fakeFetch({ [`GET ${BASE}/routines`]: rejected(500, 'broken') });
		expect(loadRoutines()).rejects.toThrow('broken');
	});
});

describe('loadRoutineDays', () => {
	test('replaces the days from yesterday on and leaves older days alone', async () => {
		fakeFetch({
			[`GET ${BASE}/edit`]: () => Response.json([task(12, '2026-10-14'), task(13, '2026-10-15')])
		});
		await loadRoutineDays();
		expect(tasker.tasks.map((entry) => entry.id)).toEqual([10, 12, 13]);
	});

	test('reloadRoutines reads both', async () => {
		fakeFetch({
			[`GET ${BASE}/routines`]: () => Response.json([routine(2)]),
			[`GET ${BASE}/edit`]: () => Response.json([task(14, '2026-10-20')])
		});
		await reloadRoutines();
		expect(tasker.routines.map((entry) => entry.id)).toEqual([2]);
		expect(tasker.tasks.map((entry) => entry.id)).toEqual([10, 14]);
	});
});

describe('addRoutine', () => {
	test('is listed with its days, and says what it made', async () => {
		fakeFetch({
			[`POST ${BASE}/routines`]: () => Response.json(routine(2, { title: 'Meds' })),
			[`GET ${BASE}/edit`]: () => Response.json([task(20, '2026-10-14')])
		});
		await addRoutine({ title: 'Meds' });
		expect(tasker.routines.map((entry) => entry.id)).toEqual([1, 2]);
		expect(tasker.tasks.map((entry) => entry.id)).toEqual([10, 20]);
		expect(tasker.toasts.at(-1)!.message).toBe('Added Meds, every day');
	});

	test('its Undo removes the routine again', async () => {
		let deleted: unknown = null;
		fakeFetch({
			[`POST ${BASE}/routines`]: () => Response.json(routine(2)),
			[`GET ${BASE}/edit`]: () => Response.json([]),
			[`DELETE ${BASE}/routines`]: async (request) => {
				deleted = await request.json();
				return Response.json(routine(2));
			}
		});
		await addRoutine({ title: 'x' });
		await undo();
		expect(deleted).toEqual({ id: 2 });
		expect(tasker.routines.map((entry) => entry.id)).toEqual([1]);
	});

	test('a refusal rejects with the reason and adds nothing', async () => {
		fakeFetch({ [`POST ${BASE}/routines`]: rejected(400, 'repeat must be daily') });
		expect(addRoutine({})).rejects.toThrow('repeat must be daily');
		expect(tasker.routines).toHaveLength(1);
	});
});

describe('changeRoutine', () => {
	test('shows the stored routine, and its Undo changes it back', async () => {
		const sent: unknown[] = [];
		fakeFetch({
			[`PUT ${BASE}/routines`]: async (request) => {
				const body = (await request.json()) as Partial<Routine>;
				sent.push(body);
				return Response.json(routine(1, body));
			},
			[`GET ${BASE}/edit`]: () => Response.json([])
		});
		await changeRoutine({ id: 1, startTime: 750, title: 'Meal' });
		expect(tasker.routines[0]).toMatchObject({ startTime: 750, title: 'Meal' });
		await undo();
		expect(sent[1]).toEqual({ id: 1, startTime: 720, title: 'Routine 1' });
		expect(tasker.routines[0]).toMatchObject({ startTime: 720, title: 'Routine 1' });
	});

	test('a refusal leaves the routine and says why', async () => {
		fakeFetch({ [`PUT ${BASE}/routines`]: rejected(400, 'routines cannot cross midnight') });
		expect(await changeRoutine({ id: 1, startTime: 1430 })).toBeNull();
		expect(tasker.routines[0].startTime).toBe(720);
		expect(tasker.toasts.at(-1)!.message).toContain('routines cannot cross midnight');
	});

	test('an unknown routine does nothing', async () => {
		fakeFetch({});
		expect(await changeRoutine({ id: 99, title: 'x' })).toBeNull();
	});
});

describe('removeRoutine', () => {
	test('removes it and its days, and its Undo makes it again from what the backend answered', async () => {
		let created: unknown = null;
		fakeFetch({
			[`DELETE ${BASE}/routines`]: () => Response.json(routine(1)),
			[`POST ${BASE}/routines`]: async (request) => {
				created = await request.json();
				return Response.json(routine(5));
			},
			[`GET ${BASE}/edit`]: () => Response.json([])
		});
		expect(await removeRoutine(routine(1))).toBe(true);
		expect(tasker.routines).toEqual([]);
		expect(tasker.tasks.map((entry) => entry.id)).toEqual([10]);
		await undo();
		expect(created).toMatchObject({ title: 'Routine 1', repeat: 'daily', startTime: 720 });
		expect(tasker.routines.map((entry) => entry.id)).toEqual([5]);
	});

	test('a refusal keeps the routine and says why', async () => {
		fakeFetch({ [`DELETE ${BASE}/routines`]: rejected(404, 'Routine not found') });
		expect(await removeRoutine(routine(1))).toBe(false);
		expect(tasker.routines).toHaveLength(1);
		expect(tasker.toasts.at(-1)!.message).toContain('Routine not found');
	});
});

describe('undoPatch', () => {
	test('holds the old value of each changed field, never through', () => {
		expect(undoPatch(routine(1), { startTime: 750, through: '2026-11-01' })).toEqual({
			startTime: 720
		});
	});
});
