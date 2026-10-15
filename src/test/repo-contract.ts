/// <reference types="bun" />
/**
 * What every `Repo` must do, written once. The database repo runs it, so does the one on a
 * guest's device later. `open(email)` hands out a repo for that user on the same storage, creating
 * the user when the storage needs one. `reset` gives every test an empty storage.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { NewEvent, NewTask, Repo } from '#lib/core/repo.js';
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
				durationMin: 5
			});
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
				showClock: false,
				clock12h: null,
				checkInMinutes: 5,
				myDayStart: 420,
				myDayEnd: 1380,
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
