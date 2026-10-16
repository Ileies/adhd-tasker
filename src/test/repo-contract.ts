/// <reference types="bun" />
/**
 * What every `Repo` must do, written once. The database repo runs it, so does the one on a
 * guest's device later. `open(email)` hands out a repo for that user on the same storage, creating
 * the user when the storage needs one. `reset` gives every test an empty storage.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { NewEvent, NewFlowRow, NewRoutine, NewTask, NewTodo, Repo } from '#lib/core/repo.js';
import { Priority, TaskStatus } from '#lib/types.js';

export interface RepoHarness {
	reset(): Promise<void>;
	open(email: string): Promise<Repo>;
}

const task = (overrides: Partial<NewTask> = {}): NewTask => ({
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: Priority.Medium,
	...overrides
});

const event = (overrides: Partial<NewEvent> = {}): NewEvent => ({
	type: 'task.completed',
	payload: { title: 'x' },
	origin: 'user',
	createdAt: 1000,
	...overrides
});

export function describeRepo(name: string, harness: RepoHarness) {
	let repo: Repo;
	let other: Repo;

	beforeEach(async () => {
		await harness.reset();
		repo = await harness.open('ada@example.com');
		other = await harness.open('bob@example.com');
	});

	describe(`${name}: tasks`, () => {
		test('an inserted task gets an id and a pending status', async () => {
			const created = await repo.tasks.insert(task());
			expect(created.id).toBeGreaterThan(0);
			expect(created.status).toBe(TaskStatus.Pending);
		});

		test('between lists both days inclusive, ordered by date then start', async () => {
			await repo.tasks.insert(task({ date: '2026-10-15', startTime: 60, title: 'c' }));
			await repo.tasks.insert(task({ date: '2026-10-14', startTime: 600, title: 'b' }));
			await repo.tasks.insert(task({ date: '2026-10-14', startTime: 60, title: 'a' }));
			await repo.tasks.insert(task({ date: '2026-10-16', title: 'outside' }));
			const rows = await repo.tasks.between('2026-10-14', '2026-10-15');
			expect(rows.map((row) => row.title)).toEqual(['a', 'b', 'c']);
		});

		test('between without an end lists everything from the start day on', async () => {
			await repo.tasks.insert(task({ date: '2026-10-13', title: 'before' }));
			await repo.tasks.insert(task({ date: '2030-01-01', title: 'far' }));
			expect((await repo.tasks.between('2026-10-14')).map((row) => row.title)).toEqual(['far']);
		});

		test('a missing id answers null for get, update and delete', async () => {
			expect(await repo.tasks.get(999)).toBeNull();
			expect(await repo.tasks.update(999, { title: 'x' })).toBeNull();
			expect(await repo.tasks.delete(999)).toBeNull();
		});

		test('update changes only the given fields and returns the task', async () => {
			const created = await repo.tasks.insert(task());
			const updated = await repo.tasks.update(created.id, { title: 'New', duration: 30 });
			expect(updated).toEqual({ ...created, title: 'New', duration: 30 });
			expect(await repo.tasks.get(created.id)).toEqual(updated);
		});

		test('an empty patch returns the task unchanged', async () => {
			const created = await repo.tasks.insert(task());
			expect(await repo.tasks.update(created.id, {})).toEqual(created);
		});

		test('delete returns the task as it was and removes it', async () => {
			const created = await repo.tasks.insert(task());
			expect(await repo.tasks.delete(created.id)).toEqual(created);
			expect(await repo.tasks.get(created.id)).toBeNull();
		});

		test('restore brings a deleted task back under its old id', async () => {
			const created = await repo.tasks.insert(task());
			await repo.tasks.delete(created.id);
			await repo.tasks.restore(created);
			expect(await repo.tasks.get(created.id)).toEqual(created);
		});

		test('restore leaves a task alone whose id is taken', async () => {
			const created = await repo.tasks.insert(task());
			await repo.tasks.restore({ ...created, title: 'Impostor' });
			expect((await repo.tasks.get(created.id))?.title).toBe('Write intro');
		});

		test('another user sees none of it and cannot change it', async () => {
			const created = await repo.tasks.insert(task());
			expect(await other.tasks.get(created.id)).toBeNull();
			expect(await other.tasks.between('2000-01-01')).toEqual([]);
			expect(await other.tasks.update(created.id, { title: 'Hijacked' })).toBeNull();
			expect(await other.tasks.delete(created.id)).toBeNull();
			expect((await repo.tasks.get(created.id))?.title).toBe('Write intro');
		});
	});

	describe(`${name}: task completion`, () => {
		test('a new task has no completion time', async () => {
			expect((await repo.tasks.insert(task())).completedAt).toBeNull();
		});

		test('a completion time is stored and cleared again', async () => {
			const created = await repo.tasks.insert(task());
			expect((await repo.tasks.update(created.id, { completedAt: 5000 }))?.completedAt).toBe(5000);
			expect((await repo.tasks.get(created.id))?.completedAt).toBe(5000);
			expect((await repo.tasks.update(created.id, { completedAt: null }))?.completedAt).toBeNull();
		});
	});

	describe(`${name}: task kinds`, () => {
		test('a new task is a block without a parent', async () => {
			const created = await repo.tasks.insert(task());
			expect(created).toMatchObject({ kind: 'block', parentId: null });
			expect(await repo.tasks.get(created.id)).toMatchObject({ kind: 'block', parentId: null });
		});

		test('an appointment and the travel to it keep their kind and link', async () => {
			const exam = await repo.tasks.insert(task({ kind: 'appointment' }));
			const travel = await repo.tasks.insert(
				task({ startTime: 480, duration: 45, kind: 'travel', parentId: exam.id })
			);
			expect(await repo.tasks.get(exam.id)).toMatchObject({ kind: 'appointment', parentId: null });
			expect(await repo.tasks.get(travel.id)).toMatchObject({
				kind: 'travel',
				parentId: exam.id
			});
		});

		test('the kind and the parent can be changed', async () => {
			const created = await repo.tasks.insert(task());
			const changed = await repo.tasks.update(created.id, { kind: 'appointment' });
			expect(changed?.kind).toBe('appointment');
			const linked = await repo.tasks.update(created.id, { parentId: 7 });
			expect(linked?.parentId).toBe(7);
		});
	});

	describe(`${name}: shift`, () => {
		test('a new task stays by default', async () => {
			const created = await repo.tasks.insert(task());
			expect(created.shift).toBe(0);
			expect((await repo.tasks.get(created.id))?.shift).toBe(0);
		});

		test('how far a task may move is kept and can be changed', async () => {
			const created = await repo.tasks.insert(task({ shift: 60 }));
			expect((await repo.tasks.get(created.id))?.shift).toBe(60);
			expect((await repo.tasks.update(created.id, { shift: 15 }))?.shift).toBe(15);
		});
	});

	describe(`${name}: todos`, () => {
		const todo = (overrides: Partial<NewTodo> = {}): NewTodo => ({
			title: 'Study Math',
			priority: Priority.High,
			createdAt: 1000,
			...overrides
		});

		test('a new to-do starts open at 0 % with calm defaults', async () => {
			const created = await repo.todos.insert(todo());
			expect(created).toEqual({
				id: created.id,
				title: 'Study Math',
				description: '',
				priority: Priority.High,
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
				createdAt: 1000,
				completedAt: null
			});
			expect(created.id).toBeGreaterThan(0);
		});

		test('given fields are kept', async () => {
			const created = await repo.todos.insert(
				todo({
					estimate: 600,
					dueDate: '2026-11-05',
					dueTime: 665,
					parentId: 7,
					nextStep: 'Open notes'
				})
			);
			expect(await repo.todos.get(created.id)).toEqual(created);
			expect(created).toMatchObject({
				estimate: 600,
				dueDate: '2026-11-05',
				dueTime: 665,
				parentId: 7,
				nextStep: 'Open notes'
			});
		});

		test('open lists only open to-dos, oldest first', async () => {
			const a = await repo.todos.insert(todo({ title: 'a' }));
			const b = await repo.todos.insert(todo({ title: 'b' }));
			await repo.todos.insert(todo({ title: 'c', status: 'dropped' }));
			await repo.todos.update(a.id, { status: 'done', completedAt: 2000 });
			expect((await repo.todos.open()).map((row) => row.id)).toEqual([b.id]);
		});

		test('all lists every to-do in any state', async () => {
			await repo.todos.insert(todo({ title: 'a' }));
			await repo.todos.insert(todo({ title: 'b', status: 'ended' }));
			expect((await repo.todos.all()).map((row) => row.title)).toEqual(['a', 'b']);
		});

		test('doneSince lists to-dos finished at or after a time', async () => {
			const a = await repo.todos.insert(todo({ title: 'a' }));
			const b = await repo.todos.insert(todo({ title: 'b' }));
			await repo.todos.insert(todo({ title: 'open' }));
			await repo.todos.update(a.id, { status: 'done', completedAt: 1999 });
			await repo.todos.update(b.id, { status: 'done', completedAt: 2000 });
			expect((await repo.todos.doneSince(2000)).map((row) => row.title)).toEqual(['b']);
		});

		test('update changes only the given fields and returns the to-do', async () => {
			const created = await repo.todos.insert(todo());
			const updated = await repo.todos.update(created.id, { progress: 40, spentMinutes: 30 });
			expect(updated).toEqual({ ...created, progress: 40, spentMinutes: 30 });
			expect(await repo.todos.get(created.id)).toEqual(updated);
		});

		test('an empty patch returns the to-do unchanged', async () => {
			const created = await repo.todos.insert(todo());
			expect(await repo.todos.update(created.id, {})).toEqual(created);
		});

		test('a missing id answers null for get, update and delete', async () => {
			expect(await repo.todos.get(999)).toBeNull();
			expect(await repo.todos.update(999, { progress: 1 })).toBeNull();
			expect(await repo.todos.delete(999)).toBeNull();
		});

		test('delete returns the to-do as it was, restore brings it back under its id', async () => {
			const created = await repo.todos.insert(todo());
			expect(await repo.todos.delete(created.id)).toEqual(created);
			expect(await repo.todos.get(created.id)).toBeNull();
			await repo.todos.restore(created);
			expect(await repo.todos.get(created.id)).toEqual(created);
		});

		test('restore leaves a to-do alone whose id is taken', async () => {
			const created = await repo.todos.insert(todo());
			await repo.todos.restore({ ...created, title: 'Impostor' });
			expect((await repo.todos.get(created.id))?.title).toBe('Study Math');
		});

		test('another user sees none of it and cannot change it', async () => {
			const created = await repo.todos.insert(todo());
			expect(await other.todos.get(created.id)).toBeNull();
			expect(await other.todos.open()).toEqual([]);
			expect(await other.todos.update(created.id, { title: 'Hijacked' })).toBeNull();
			expect(await other.todos.delete(created.id)).toBeNull();
			expect((await repo.todos.get(created.id))?.title).toBe('Study Math');
		});
	});

	describe(`${name}: routines`, () => {
		const routine = (overrides: Partial<NewRoutine> = {}): NewRoutine => ({
			title: 'Lunch',
			priority: Priority.Medium,
			startTime: 720,
			duration: 45,
			repeat: 'daily',
			firstDay: '2026-10-14',
			...overrides
		});

		test('a new routine goes on, stays put and has made nothing yet', async () => {
			const created = await repo.routines.insert(routine());
			expect(created).toEqual({
				id: created.id,
				title: 'Lunch',
				description: '',
				priority: Priority.Medium,
				startTime: 720,
				duration: 45,
				shift: 0,
				kind: 'block',
				repeat: 'daily',
				firstDay: '2026-10-14',
				lastDay: null,
				through: null
			});
			expect(created.id).toBeGreaterThan(0);
			expect(await repo.routines.get(created.id)).toEqual(created);
		});

		test('given fields are kept', async () => {
			const created = await repo.routines.insert(
				routine({
					kind: 'appointment',
					shift: 60,
					repeat: 'days:1,3',
					lastDay: '2026-12-31',
					through: '2026-10-20'
				})
			);
			expect(await repo.routines.get(created.id)).toMatchObject({
				kind: 'appointment',
				shift: 60,
				repeat: 'days:1,3',
				lastDay: '2026-12-31',
				through: '2026-10-20'
			});
		});

		test('all lists every routine, oldest first', async () => {
			await repo.routines.insert(routine({ title: 'a' }));
			await repo.routines.insert(routine({ title: 'b' }));
			expect((await repo.routines.all()).map((row) => row.title)).toEqual(['a', 'b']);
		});

		test('update changes only the given fields and returns the routine', async () => {
			const created = await repo.routines.insert(routine());
			const updated = await repo.routines.update(created.id, {
				startTime: 750,
				through: '2026-10-27'
			});
			expect(updated).toEqual({ ...created, startTime: 750, through: '2026-10-27' });
			expect(await repo.routines.get(created.id)).toEqual(updated);
		});

		test('an empty patch returns the routine unchanged', async () => {
			const created = await repo.routines.insert(routine());
			expect(await repo.routines.update(created.id, {})).toEqual(created);
		});

		test('a missing id answers null for get, update and delete', async () => {
			expect(await repo.routines.get(999)).toBeNull();
			expect(await repo.routines.update(999, { title: 'x' })).toBeNull();
			expect(await repo.routines.delete(999)).toBeNull();
		});

		test('delete returns the routine as it was, restore brings it back under its id', async () => {
			const created = await repo.routines.insert(routine());
			expect(await repo.routines.delete(created.id)).toEqual(created);
			expect(await repo.routines.get(created.id)).toBeNull();
			await repo.routines.restore(created);
			expect(await repo.routines.get(created.id)).toEqual(created);
		});

		test('restore leaves a routine alone whose id is taken', async () => {
			const created = await repo.routines.insert(routine());
			await repo.routines.restore({ ...created, title: 'Impostor' });
			expect((await repo.routines.get(created.id))?.title).toBe('Lunch');
		});

		test('a task keeps the routine it came from', async () => {
			const created = await repo.routines.insert(routine());
			const first = await repo.tasks.insert(task({ routineId: created.id }));
			const own = await repo.tasks.insert(task());
			expect((await repo.tasks.get(first.id))?.routineId).toBe(created.id);
			expect(own.routineId).toBeNull();
			expect((await repo.tasks.update(first.id, { routineId: null }))?.routineId).toBeNull();
		});

		test('another user sees none of it and cannot change it', async () => {
			const created = await repo.routines.insert(routine());
			expect(await other.routines.get(created.id)).toBeNull();
			expect(await other.routines.all()).toEqual([]);
			expect(await other.routines.update(created.id, { title: 'Hijacked' })).toBeNull();
			expect(await other.routines.delete(created.id)).toBeNull();
			expect((await repo.routines.get(created.id))?.title).toBe('Lunch');
		});
	});

	describe(`${name}: flow log`, () => {
		const row = (overrides: Partial<NewFlowRow> = {}): NewFlowRow => ({
			at: 1000,
			date: '2026-10-14',
			type: 'start',
			...overrides
		});

		test('an inserted row gets an id and empty links and data', async () => {
			const created = await repo.flow.insert(row());
			expect(created).toEqual({
				id: created!.id,
				at: 1000,
				date: '2026-10-14',
				type: 'start',
				todoId: null,
				taskId: null,
				data: {},
				key: null
			});
		});

		test('day lists one day oldest first', async () => {
			await repo.flow.insert(row({ at: 3000, type: 'rest' }));
			await repo.flow.insert(row({ at: 1000, type: 'start' }));
			await repo.flow.insert(row({ at: 2000, type: 'choose', todoId: 4, data: { why: 'x' } }));
			await repo.flow.insert(row({ at: 500, date: '2026-10-13' }));
			const rows = await repo.flow.day('2026-10-14');
			expect(rows.map((r) => r.type)).toEqual(['start', 'choose', 'rest']);
			expect(rows[1]).toMatchObject({ todoId: 4, data: { why: 'x' } });
		});

		test('all lists every day oldest first', async () => {
			await repo.flow.insert(row({ at: 3000, date: '2026-10-15' }));
			await repo.flow.insert(row({ at: 1000, date: '2026-10-13' }));
			expect((await repo.flow.all()).map((r) => r.at)).toEqual([1000, 3000]);
		});

		test('a known key answers null and writes nothing', async () => {
			const first = await repo.flow.insert(row({ type: 'pin', key: 'pin:1000', todoId: 1 }));
			expect(first).not.toBeNull();
			expect(await repo.flow.insert(row({ type: 'pin', key: 'pin:1000', todoId: 2 }))).toBeNull();
			expect(await repo.flow.day('2026-10-14')).toHaveLength(1);
		});

		test('rows without a key never collide', async () => {
			await repo.flow.insert(row());
			await repo.flow.insert(row());
			expect(await repo.flow.day('2026-10-14')).toHaveLength(2);
		});

		test('prune removes rows from before a time', async () => {
			await repo.flow.insert(row({ at: 1000 }));
			await repo.flow.insert(row({ at: 3000 }));
			await repo.flow.prune(2000);
			expect((await repo.flow.day('2026-10-14')).map((r) => r.at)).toEqual([3000]);
		});

		test('another user has its own rows and keys', async () => {
			await repo.flow.insert(row({ type: 'pin', key: 'pin:1000' }));
			expect(await other.flow.day('2026-10-14')).toEqual([]);
			expect(await other.flow.insert(row({ type: 'pin', key: 'pin:1000' }))).not.toBeNull();
		});
	});

	describe(`${name}: agent actions`, () => {
		const record = (eventId: number | null, createdAt = 1000) =>
			repo.actions.record({
				tool: 'add_task',
				before: null,
				after: null,
				eventId,
				reason: null,
				createdAt
			});

		test('a recorded action starts not undone and keeps its tasks', async () => {
			const after = await repo.tasks.insert(task());
			const id = await repo.actions.record({
				tool: 'add_task',
				before: null,
				after,
				eventId: null,
				reason: 'because'
			});
			const action = await repo.actions.get(id);
			expect(action).toMatchObject({ tool: 'add_task', before: null, after, reason: 'because' });
			expect(action?.undoneAt).toBeNull();
		});

		test('markUndone sets the time', async () => {
			const id = await record(null);
			await repo.actions.markUndone(id, 5000);
			expect((await repo.actions.get(id))?.undoneAt).toBe(5000);
		});

		test('recent is newest first and limited', async () => {
			const first = await record(null);
			const second = await record(null);
			await record(null);
			expect((await repo.actions.recent(2)).map((a) => a.id)).toEqual([second + 1, second]);
			expect(first).toBeLessThan(second);
		});

		test('latestId is 0 without actions', async () => {
			expect(await repo.actions.latestId()).toBe(0);
			const id = await record(null);
			expect(await repo.actions.latestId()).toBe(id);
		});

		test('ownSince lists only reactions that are not undone, oldest first', async () => {
			const before = await record(7);
			const reaction = await record(7);
			await record(null); // made in the chat
			const undone = await record(7);
			await repo.actions.markUndone(undone, 1);
			const later = await record(8);
			expect((await repo.actions.ownSince(before)).map((a) => a.id)).toEqual([reaction, later]);
		});

		test('anySince is true only for actions after the moment', async () => {
			await record(null, 1000);
			expect(await repo.actions.anySince(999)).toBe(true);
			expect(await repo.actions.anySince(1000)).toBe(false);
		});

		test('another user sees none of it and cannot undo it', async () => {
			const id = await record(null);
			expect(await other.actions.get(id)).toBeNull();
			expect(await other.actions.recent(10)).toEqual([]);
			expect(await other.actions.latestId()).toBe(0);
			await other.actions.markUndone(id, 5000);
			expect((await repo.actions.get(id))?.undoneAt).toBeNull();
		});
	});

	describe(`${name}: events`, () => {
		test('a second event with the same key is not stored', async () => {
			expect(await repo.events.insert(event({ key: 'k' }))).not.toBeNull();
			expect(await repo.events.insert(event({ key: 'k' }))).toBeNull();
			expect(await repo.events.recent(10)).toHaveLength(1);
		});

		test('events without a key are all stored', async () => {
			await repo.events.insert(event());
			await repo.events.insert(event());
			expect(await repo.events.recent(10)).toHaveLength(2);
		});

		test('two users can log the same key', async () => {
			await repo.events.insert(event({ key: 'k' }));
			expect(await other.events.insert(event({ key: 'k' }))).not.toBeNull();
		});

		test('unhandled lists what is open, oldest first, and settle closes it', async () => {
			const a = await repo.events.insert(event());
			const b = await repo.events.insert(event());
			await repo.events.insert(event({ handledAt: 1000, outcome: 'done' }));
			expect((await repo.events.unhandled()).map((row) => row.id)).toEqual([a!, b!]);
			await repo.events.settle([a!], 'silent', 2000);
			const rows = await repo.events.recent(10);
			expect(rows.find((row) => row.id === a)).toMatchObject({
				handledAt: 2000,
				outcome: 'silent'
			});
			expect((await repo.events.unhandled()).map((row) => row.id)).toEqual([b!]);
		});

		test('settle with no ids does nothing', async () => {
			await repo.events.insert(event());
			await repo.events.settle([], 'x', 1);
			expect(await repo.events.unhandled()).toHaveLength(1);
		});

		test('recent is newest first and limited', async () => {
			const a = await repo.events.insert(event());
			const b = await repo.events.insert(event());
			await repo.events.insert(event());
			const rows = await repo.events.recent(2);
			expect(rows).toHaveLength(2);
			expect(rows[1].id).toBe(b!);
			expect(a).toBeLessThan(b!);
		});

		test('knownKeys answers which keys are logged', async () => {
			await repo.events.insert(event({ key: 'a' }));
			await other.events.insert(event({ key: 'b' }));
			expect(await repo.events.knownKeys(['a', 'b', 'c'])).toEqual(new Set(['a']));
			expect(await repo.events.knownKeys([])).toEqual(new Set());
		});

		test('prune removes old handled events and keeps open and recent ones', async () => {
			await repo.events.insert(event({ createdAt: 100, handledAt: 100, outcome: 'old' }));
			const keep = await repo.events.insert(event({ createdAt: 100 }));
			await repo.events.insert(event({ createdAt: 900, handledAt: 900, outcome: 'new' }));
			await repo.events.prune(500);
			const ids = (await repo.events.recent(10)).map((row) => row.id);
			expect(ids).toHaveLength(2);
			expect(ids).toContain(keep!);
		});

		test('the payload survives as it was written', async () => {
			await repo.events.insert(event({ payload: { title: 'a', nested: { n: [1, 2] } } }));
			expect((await repo.events.recent(1))[0].payload).toEqual({
				title: 'a',
				nested: { n: [1, 2] }
			});
		});
	});

	describe(`${name}: cards`, () => {
		test('open is null without a card', async () => {
			expect(await repo.cards.open()).toBeNull();
		});

		test('a new card replaces the open one', async () => {
			const first = await repo.cards.show({ kind: 'say', text: 'one', createdAt: 1000 });
			const second = await repo.cards.show({
				kind: 'ask',
				text: 'two',
				options: ['yes', 'no'],
				createdAt: 2000
			});
			expect((await repo.cards.open())?.id).toBe(second.id);
			expect(second.options).toEqual(['yes', 'no']);
			expect(await repo.cards.resolve(first.id, 3000)).toBe(false);
		});

		test('a card without options stores none', async () => {
			const card = await repo.cards.show({ kind: 'say', text: 'one', options: [], createdAt: 1 });
			expect(card.options).toBeNull();
		});

		test('resolve closes an open card once', async () => {
			const card = await repo.cards.show({ kind: 'say', text: 'one', createdAt: 1000 });
			expect(await repo.cards.resolve(card.id, 2000)).toBe(true);
			expect(await repo.cards.resolve(card.id, 3000)).toBe(false);
			expect(await repo.cards.open()).toBeNull();
		});

		test('another user has no access to a card', async () => {
			const card = await repo.cards.show({ kind: 'say', text: 'one', createdAt: 1000 });
			expect(await other.cards.open()).toBeNull();
			expect(await other.cards.resolve(card.id, 2000)).toBe(false);
			expect((await repo.cards.open())?.id).toBe(card.id);
		});

		test('a new card of one user leaves the open card of another', async () => {
			const mine = await repo.cards.show({ kind: 'say', text: 'one', createdAt: 1000 });
			await other.cards.show({ kind: 'say', text: 'two', createdAt: 2000 });
			expect((await repo.cards.open())?.id).toBe(mine.id);
		});

		test('prune removes old resolved cards only', async () => {
			const old = await repo.cards.show({ kind: 'say', text: 'old', createdAt: 100 });
			await repo.cards.resolve(old.id, 200);
			const open = await repo.cards.show({ kind: 'say', text: 'open', createdAt: 100 });
			await repo.cards.prune(500);
			expect((await repo.cards.open())?.id).toBe(open.id);
			expect(await repo.cards.resolve(old.id, 1)).toBe(false);
		});
	});

	describe(`${name}: schedule`, () => {
		const alarm = (fireAt: number) =>
			({ kind: 'alarm', fireAt, createdBy: 'user', createdAt: 1, label: 'x' }) as const;

		test('an inserted entry is pending with its defaults', async () => {
			const entry = await repo.schedule.insert(alarm(5000));
			expect(entry).toMatchObject({
				status: 'pending',
				repeat: 'none',
				minutes: null,
				note: null,
				durationMin: 5,
				enabled: true
			});
		});

		test('an entry that is off stays pending but is never due', async () => {
			const off = await repo.schedule.insert({ ...alarm(1000), enabled: false });
			const on = await repo.schedule.insert(alarm(1000));
			expect((await repo.schedule.pending()).map((entry) => entry.id)).toEqual([off.id, on.id]);
			expect((await repo.schedule.due(2000)).map((entry) => entry.id)).toEqual([on.id]);
			await repo.schedule.update(off.id, { enabled: true });
			expect(await repo.schedule.due(2000)).toHaveLength(2);
		});

		test('pending is soonest first and leaves out ended entries', async () => {
			const late = await repo.schedule.insert(alarm(9000));
			const soon = await repo.schedule.insert(alarm(1000));
			const gone = await repo.schedule.insert(alarm(500));
			await repo.schedule.cancel(gone.id);
			expect((await repo.schedule.pending()).map((entry) => entry.id)).toEqual([soon.id, late.id]);
		});

		test('due is what is pending and not in the future', async () => {
			const due = await repo.schedule.insert(alarm(1000));
			await repo.schedule.insert(alarm(3000));
			expect((await repo.schedule.due(1000)).map((entry) => entry.id)).toEqual([due.id]);
		});

		test('update moves an entry on or finishes it', async () => {
			const entry = await repo.schedule.insert(alarm(1000));
			await repo.schedule.update(entry.id, { fireAt: 5000 });
			expect((await repo.schedule.pending())[0].fireAt).toBe(5000);
			await repo.schedule.update(entry.id, { status: 'done' });
			expect(await repo.schedule.pending()).toEqual([]);
		});

		test('cancel returns the entry once and null afterwards', async () => {
			const entry = await repo.schedule.insert(alarm(1000));
			expect((await repo.schedule.cancel(entry.id))?.id).toBe(entry.id);
			expect(await repo.schedule.cancel(entry.id)).toBeNull();
			expect(await repo.schedule.cancel(999)).toBeNull();
		});

		test('a tone is stored as written', async () => {
			const entry = await repo.schedule.insert({
				...alarm(1000),
				tone: 'chime'
			});
			expect((await repo.schedule.pending())[0].tone).toEqual(entry.tone);
		});

		test('another user sees and cancels nothing', async () => {
			const entry = await repo.schedule.insert(alarm(1000));
			expect(await other.schedule.pending()).toEqual([]);
			expect(await other.schedule.due(9000)).toEqual([]);
			expect(await other.schedule.cancel(entry.id)).toBeNull();
			await other.schedule.update(entry.id, { status: 'done' });
			expect(await repo.schedule.pending()).toHaveLength(1);
		});

		test('prune removes old finished entries only', async () => {
			const old = await repo.schedule.insert(alarm(100));
			await repo.schedule.update(old.id, { status: 'done' });
			const pending = await repo.schedule.insert(alarm(100));
			const recent = await repo.schedule.insert(alarm(900));
			await repo.schedule.cancel(recent.id);
			await repo.schedule.prune(500);
			expect((await repo.schedule.pending()).map((entry) => entry.id)).toEqual([pending.id]);
			expect(await repo.schedule.cancel(recent.id)).toBeNull();
		});
	});

	describe(`${name}: usage`, () => {
		test('tokensSince sums from the moment on, inclusive', async () => {
			await repo.usage.record('chat', 10, 100);
			await repo.usage.record('reaction', 5, 200);
			await repo.usage.record('chat', 7, 300);
			expect(await repo.usage.tokensSince(200)).toBe(12);
			expect(await repo.usage.tokensSince(1000)).toBe(0);
		});

		test('countSince counts one use', async () => {
			await repo.usage.record('tone', 0, 100);
			await repo.usage.record('tone', 0, 200);
			await repo.usage.record('chat', 3, 200);
			expect(await repo.usage.countSince('tone', 150)).toBe(1);
		});

		test('timesSince lists the moments of one use', async () => {
			await repo.usage.record('reaction', 1, 100);
			await repo.usage.record('chat', 1, 150);
			await repo.usage.record('reaction', 1, 200);
			expect((await repo.usage.timesSince('reaction', 100)).sort()).toEqual([100, 200]);
		});

		test('another user counts separately', async () => {
			await repo.usage.record('chat', 10, 100);
			expect(await other.usage.tokensSince(0)).toBe(0);
		});

		test('prune removes old rows', async () => {
			await repo.usage.record('chat', 10, 100);
			await repo.usage.record('chat', 5, 900);
			await repo.usage.prune(500);
			expect(await repo.usage.tokensSince(0)).toBe(5);
		});
	});

	describe(`${name}: settings`, () => {
		test('a new user has the calm defaults', async () => {
			expect(await repo.settings.get()).toMatchObject({
				enableReminders: true,
				hyperfocusAlarm: true,
				overrunMinutes: 15,
				aiAutonomy: 'suggest',
				quietStart: 1320,
				quietEnd: 420,
				dailyTokenBudget: null,
				openaiKey: null,
				voiceReplies: false,
				openaiTranscribe: true,
				voiceLanguage: null,
				showClock: false,
				clock12h: null,
				checkInMinutes: 5,
				myDayStart: 420,
				myDayEnd: 1380,
				checkMinutes: 30,
				breakMinutes: 10,
				arriveEarlyMinutes: 10,
				startWorkAt: 540,
				locationLat: null,
				locationLon: null,
				locationName: null,
				locationSource: null,
				displayDevice: null
			});
		});

		test('update changes the given fields and returns all of them', async () => {
			const next = await repo.settings.update({ voiceReplies: true, timezone: 'Asia/Tokyo' });
			expect(next).toMatchObject({
				voiceReplies: true,
				timezone: 'Asia/Tokyo',
				overrunMinutes: 15
			});
			expect(await repo.settings.get()).toEqual(next);
		});

		test('a field can be set back to null', async () => {
			await repo.settings.update({ dailyTokenBudget: 1000 });
			expect((await repo.settings.update({ dailyTokenBudget: null })).dailyTokenBudget).toBeNull();
		});

		test('settings do not leak between users', async () => {
			await repo.settings.update({ overrunMinutes: 30 });
			expect((await other.settings.get()).overrunMinutes).toBe(15);
		});
	});
}
