/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { EXPORT_APP, EXPORT_VERSION, buildExport, type ExportFile } from '#lib/core/export.js';
import { SNAPSHOT_DAYS } from '#lib/core/merge.js';
import { listSnapshots, moveIntoAccount, restoreSnapshot } from '#lib/server/account.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { db } from '#lib/server/db/index.js';
import { planSnapshots } from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeTask, makeUser } from '#test/fixtures.js';
import { Priority, TaskStatus } from '#lib/types.js';

beforeEach(resetDb);

const NOW = Date.UTC(2026, 9, 14, 12);
const TODAY = '2026-10-14';
const DAY = 24 * 60 * 60 * 1000;

const task = (date: string, title: string, startTime = 540) => ({
	title,
	description: '',
	date,
	startTime,
	duration: 60,
	priority: Priority.Medium,
	status: TaskStatus.Pending
});

const alarm = (label: string, fireAt = NOW + DAY) => ({
	fireAt,
	minutes: null,
	repeat: 'none' as const,
	label,
	tone: 'chime' as const,
	durationMin: 5
});

const file = (overrides: Partial<ExportFile> = {}): ExportFile => ({
	app: EXPORT_APP,
	version: EXPORT_VERSION,
	exportedAt: NOW,
	settings: {},
	tasks: [],
	todos: [],
	flow: [],
	alarms: [],
	...overrides
});

const planOf = async (email = TEST_EMAIL) =>
	(await buildExport(dbRepo(email), NOW)).tasks.map((t) => `${t.date} ${t.title}`);

describe('moveIntoAccount', () => {
	test('a new account takes the whole plan, the alarms and the settings', async () => {
		await makeUser();
		const result = moveIntoAccount(
			TEST_EMAIL,
			file({
				tasks: [task('2026-10-13', 'Yesterday'), task(TODAY, 'Today')],
				alarms: [alarm('Stretch')],
				settings: { showClock: true, overrunMinutes: 30 }
			}),
			'both',
			TODAY,
			NOW
		);
		expect(result).toMatchObject({ tasks: 2, skipped: 0, alarms: 1 });
		expect(await planOf()).toEqual(['2026-10-13 Yesterday', '2026-10-14 Today']);
		const exported = await buildExport(dbRepo(TEST_EMAIL), NOW);
		expect(exported.alarms.map((a) => a.label)).toEqual(['Stretch']);
		expect(exported.settings).toMatchObject({ showClock: true, overrunMinutes: 30 });
	});

	test('keep both adds to the plan, leaves the same task alone and keeps the account settings', async () => {
		await makeUser({ showClock: false });
		await makeTask({ title: 'Same', date: TODAY });
		await makeTask({ title: 'Mine', date: TODAY, startTime: 700 });
		const result = moveIntoAccount(
			TEST_EMAIL,
			file({
				tasks: [task(TODAY, 'Same'), task(TODAY, 'From device', 800)],
				settings: { showClock: true }
			}),
			'both',
			TODAY,
			NOW
		);
		expect(result).toMatchObject({ tasks: 1, skipped: 1 });
		expect(await planOf()).toEqual([
			'2026-10-14 Same',
			'2026-10-14 Mine',
			'2026-10-14 From device'
		]);
		expect((await dbRepo(TEST_EMAIL).settings.get()).showClock).toBe(false);
	});

	test('keep this device replaces the plan from today on and keeps the days before', async () => {
		await makeUser();
		await makeTask({ title: 'Last week', date: '2026-10-07' });
		await makeTask({ title: 'Today old', date: TODAY });
		await makeTask({ title: 'Tomorrow old', date: '2026-10-15' });
		await dbRepo(TEST_EMAIL).schedule.insert({
			kind: 'alarm',
			fireAt: NOW + DAY,
			label: 'Old alarm',
			createdBy: 'user',
			createdAt: NOW
		});
		moveIntoAccount(
			TEST_EMAIL,
			file({
				tasks: [task(TODAY, 'Today new')],
				alarms: [alarm('New alarm')],
				settings: { showClock: true }
			}),
			'replace',
			TODAY,
			NOW
		);
		expect(await planOf()).toEqual(['2026-10-07 Last week', '2026-10-14 Today new']);
		const exported = await buildExport(dbRepo(TEST_EMAIL), NOW);
		expect(exported.alarms.map((a) => a.label)).toEqual(['New alarm']);
		expect(exported.settings.showClock).toBe(true);
	});

	test('the assistant wakeups of the account are not touched by a replace', async () => {
		await makeUser();
		const repo = dbRepo(TEST_EMAIL);
		await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + DAY,
			note: 'Check in',
			createdBy: 'agent',
			createdAt: NOW
		});
		moveIntoAccount(TEST_EMAIL, file({ tasks: [task(TODAY, 'New')] }), 'replace', TODAY, NOW);
		expect((await repo.schedule.pending()).map((entry) => entry.kind)).toEqual(['wakeup']);
	});

	test('the account plan is stored as a snapshot before it is changed', async () => {
		await makeUser();
		await makeTask({ title: 'Old', date: TODAY });
		const { snapshotId } = moveIntoAccount(
			TEST_EMAIL,
			file({ tasks: [task(TODAY, 'New', 700)] }),
			'replace',
			TODAY,
			NOW
		);
		const [row] = db.select().from(planSnapshots).all();
		expect(row).toMatchObject({ id: snapshotId, email: TEST_EMAIL, taskCount: 1, createdAt: NOW });
		expect(row.file.tasks.map((t) => t.title)).toEqual(['Old']);
	});

	test('a failure halfway writes nothing, not a task and not a snapshot', async () => {
		await makeUser();
		await makeTask({ title: 'Mine', date: TODAY });
		const tasks = Array.from({ length: 250 }, (_, i) => task('2026-11-01', `Task ${i}`, i));
		// Reading this one fails in the third piece, after two pieces were written
		Object.defineProperty(tasks[220], 'description', {
			get() {
				throw new Error('disk on fire');
			}
		});
		for (const mode of ['both', 'replace'] as const) {
			expect(() => moveIntoAccount(TEST_EMAIL, file({ tasks }), mode, TODAY, NOW)).toThrow(
				'disk on fire'
			);
			expect(await planOf()).toEqual(['2026-10-14 Mine']);
			expect(db.select().from(planSnapshots).all()).toEqual([]);
		}
	});

	test('another account is never touched', async () => {
		await makeUser();
		await makeTask({ title: 'Theirs', date: TODAY, email: 'other@example.com' });
		await dbRepo('other@example.com').schedule.insert({
			kind: 'alarm',
			fireAt: NOW + DAY,
			label: 'Their alarm',
			createdBy: 'user',
			createdAt: NOW
		});
		moveIntoAccount(
			TEST_EMAIL,
			file({ tasks: [task(TODAY, 'Mine')], alarms: [alarm('Mine')] }),
			'replace',
			TODAY,
			NOW
		);
		expect(await planOf('other@example.com')).toEqual(['2026-10-14 Theirs']);
		expect((await dbRepo('other@example.com').schedule.pending()).map((a) => a.label)).toEqual([
			'Their alarm'
		]);
	});

	test('a full plan of 5000 tasks moves in one go', async () => {
		await makeUser();
		const tasks = Array.from({ length: 5000 }, (_, i) =>
			task(
				`2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
				`Task ${i}`,
				i % 1300
			)
		);
		const result = moveIntoAccount(TEST_EMAIL, file({ tasks }), 'both', TODAY, NOW);
		expect(result.tasks).toBe(5000);
		expect(await planOf()).toHaveLength(5000);
	});
});

describe('restoreSnapshot', () => {
	test('brings back the exact plan, the alarms and the settings from before the replace', async () => {
		await makeUser({ showClock: false });
		await makeTask({ title: 'Old A', date: TODAY });
		await makeTask({ title: 'Old B', date: '2026-10-20', startTime: 700 });
		await dbRepo(TEST_EMAIL).schedule.insert({
			kind: 'alarm',
			fireAt: NOW + DAY,
			label: 'Old alarm',
			createdBy: 'user',
			createdAt: NOW
		});
		const before = await buildExport(dbRepo(TEST_EMAIL), NOW);
		const { snapshotId } = moveIntoAccount(
			TEST_EMAIL,
			file({ tasks: [task(TODAY, 'New')], settings: { showClock: true } }),
			'replace',
			TODAY,
			NOW
		);
		expect(restoreSnapshot(TEST_EMAIL, snapshotId, NOW + 1000)).not.toBeNull();
		const after = await buildExport(dbRepo(TEST_EMAIL), NOW);
		expect(after.tasks).toEqual(before.tasks);
		expect(after.alarms).toEqual(before.alarms);
		expect(after.settings).toEqual(before.settings);
	});

	test('a restore is stored as a snapshot too, so it can be taken back', async () => {
		await makeUser();
		await makeTask({ title: 'Old', date: TODAY });
		const { snapshotId } = moveIntoAccount(
			TEST_EMAIL,
			file({ tasks: [task(TODAY, 'New', 700)] }),
			'replace',
			TODAY,
			NOW
		);
		const restored = restoreSnapshot(TEST_EMAIL, snapshotId, NOW + 1000)!;
		expect(await planOf()).toEqual(['2026-10-14 Old']);
		restoreSnapshot(TEST_EMAIL, restored.snapshotId, NOW + 2000);
		expect(await planOf()).toEqual(['2026-10-14 New']);
	});

	test('a snapshot of another account or one that does not exist answers null and changes nothing', async () => {
		await makeUser();
		await makeTask({ title: 'Mine', date: TODAY });
		await makeUser({ email: 'other@example.com' });
		await makeTask({ title: 'Theirs', date: TODAY, email: 'other@example.com' });
		const { snapshotId } = moveIntoAccount(
			'other@example.com',
			file({ tasks: [task(TODAY, 'New', 700)] }),
			'replace',
			TODAY,
			NOW
		);
		expect(restoreSnapshot(TEST_EMAIL, snapshotId, NOW)).toBeNull();
		expect(restoreSnapshot(TEST_EMAIL, 999, NOW)).toBeNull();
		expect(await planOf()).toEqual(['2026-10-14 Mine']);
	});
});

describe('listSnapshots', () => {
	test('lists the snapshots that still hold a plan, newest first', async () => {
		await makeUser();
		moveIntoAccount(TEST_EMAIL, file({ tasks: [task(TODAY, 'First')] }), 'both', TODAY, NOW);
		moveIntoAccount(
			TEST_EMAIL,
			file({ tasks: [task(TODAY, 'Second', 700)] }),
			'both',
			TODAY,
			NOW + 1000
		);
		expect(listSnapshots(TEST_EMAIL, NOW + 2000)).toEqual([
			{ id: 2, createdAt: NOW + 1000, tasks: 1, alarms: 0, todos: 0 }
		]);
	});

	test('a snapshot older than 30 days is no longer offered and the next one removes it', async () => {
		await makeUser();
		await makeTask({ title: 'Old', date: TODAY });
		moveIntoAccount(TEST_EMAIL, file({ tasks: [task(TODAY, 'A', 700)] }), 'both', TODAY, NOW);
		expect(listSnapshots(TEST_EMAIL, NOW + (SNAPSHOT_DAYS - 1) * DAY)).toHaveLength(1);
		expect(listSnapshots(TEST_EMAIL, NOW + (SNAPSHOT_DAYS + 1) * DAY)).toEqual([]);
		moveIntoAccount(TEST_EMAIL, file(), 'both', TODAY, NOW + (SNAPSHOT_DAYS + 1) * DAY);
		expect(db.select().from(planSnapshots).all()).toHaveLength(1);
	});

	test('only the snapshots of that account', async () => {
		await makeUser();
		await makeTask({ title: 'Mine', date: TODAY });
		await makeUser({ email: 'other@example.com' });
		await makeTask({ title: 'Theirs', date: TODAY, email: 'other@example.com' });
		moveIntoAccount(
			'other@example.com',
			file({ tasks: [task(TODAY, 'N', 700)] }),
			'both',
			TODAY,
			NOW
		);
		expect(listSnapshots(TEST_EMAIL, NOW)).toEqual([]);
	});
});

describe('to-dos in a move', () => {
	const todo = (title: string, parent: number | null = null) => ({
		title,
		description: '',
		priority: Priority.High,
		status: 'open' as const,
		estimate: 600,
		learned: false,
		progress: 25,
		spentMinutes: 90,
		skips: 0,
		skipSince: null,
		dueDate: '2026-11-05',
		dueTime: null,
		parent,
		notBefore: null,
		nextStep: null,
		createdAt: NOW,
		completedAt: null
	});

	test('the to-dos move with their appointment', async () => {
		await makeUser();
		const result = moveIntoAccount(
			TEST_EMAIL,
			file({
				tasks: [task('2026-11-05', 'Exam Math', 720)],
				todos: [todo('Prepare', 0), todo('Taxes')]
			}),
			'both',
			TODAY,
			NOW
		);
		expect(result).toMatchObject({ tasks: 1, todos: 2 });
		const repo = dbRepo(TEST_EMAIL);
		const [exam] = await repo.tasks.between(TODAY);
		expect((await repo.todos.all()).map((t) => [t.title, t.parentId, t.progress])).toEqual([
			['Prepare', exam.id, 25],
			['Taxes', null, 25]
		]);
	});

	test('a to-do the account already has is left alone', async () => {
		await makeUser();
		await dbRepo(TEST_EMAIL).todos.insert({
			title: 'Taxes',
			priority: Priority.Low,
			dueDate: '2026-11-05',
			createdAt: NOW
		});
		const result = moveIntoAccount(
			TEST_EMAIL,
			file({ todos: [todo('Taxes'), todo('New')] }),
			'both',
			TODAY,
			NOW
		);
		expect(result.todos).toBe(1);
		expect(await dbRepo(TEST_EMAIL).todos.all()).toHaveLength(2);
	});

	test('keep this device replaces the account to-dos, a restore brings them back', async () => {
		await makeUser();
		const repo = dbRepo(TEST_EMAIL);
		await repo.todos.insert({ title: 'Account to-do', priority: Priority.Low, createdAt: NOW });
		const { snapshotId } = moveIntoAccount(
			TEST_EMAIL,
			file({ todos: [todo('Device to-do')] }),
			'replace',
			TODAY,
			NOW
		);
		expect((await repo.todos.all()).map((t) => t.title)).toEqual(['Device to-do']);
		restoreSnapshot(TEST_EMAIL, snapshotId, NOW + 1000);
		expect((await repo.todos.all()).map((t) => t.title)).toEqual(['Account to-do']);
	});

	test('an account with only to-dos is not empty, so its snapshot is offered', async () => {
		await makeUser();
		await dbRepo(TEST_EMAIL).todos.insert({
			title: 'Taxes',
			priority: Priority.Low,
			createdAt: NOW
		});
		moveIntoAccount(TEST_EMAIL, file({ tasks: [task(TODAY, 'A')] }), 'both', TODAY, NOW);
		expect(listSnapshots(TEST_EMAIL, NOW)).toEqual([
			{ id: 1, createdAt: NOW, tasks: 0, alarms: 0, todos: 1 }
		]);
	});

	test('a new account with only to-dos takes the device settings along', async () => {
		await makeUser();
		moveIntoAccount(
			TEST_EMAIL,
			file({ todos: [todo('Taxes')], settings: { showClock: true } }),
			'both',
			TODAY,
			NOW
		);
		expect((await dbRepo(TEST_EMAIL).settings.get()).showClock).toBe(true);
	});
});
