/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { EXPORT_APP, EXPORT_VERSION, type ExportFile } from '#lib/core/export.js';
import type { MoveMode, MoveResult } from '#lib/core/merge.js';
import { openLocalDb } from '#lib/local/db.js';
import { declineMove, readBackup, readDevice } from '#lib/local/device.js';
import { localRepo } from '#lib/local/repo.js';
import { DATABASE_NAME } from '#lib/local/runtime.js';
import { chooseMove, checkMove } from '#lib/move.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';
import { Priority } from '#lib/types.js';
import { freshIndexedDb } from '#test/idb.js';

const EMAIL = 'ada@example.com';
const file = (tasks: { title: string; date?: string; startTime?: number }[] = []): ExportFile => ({
	app: EXPORT_APP,
	version: EXPORT_VERSION,
	exportedAt: 0,
	settings: {},
	tasks: tasks.map((task) => ({
		description: '',
		date: '2026-10-14',
		startTime: 540,
		duration: 60,
		priority: Priority.Medium,
		status: 'pending' as never,
		...task
	})),
	alarms: []
});

const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

/** The device of a former guest, in the browser's IndexedDB. */
async function guestDevice(titles: string[], key: string | null = null) {
	const factory = freshIndexedDb();
	Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
	const db = await openLocalDb(factory, DATABASE_NAME);
	const repo = localRepo(db);
	for (const [i, title] of titles.entries())
		await repo.tasks.insert({
			title,
			description: '',
			date: '2026-10-14',
			startTime: 540 + i * 100,
			duration: 60,
			priority: Priority.Medium
		});
	if (key) await repo.settings.update({ openaiKey: key });
	db.close();
}

const deviceTitles = async () =>
	(await readDevice(Date.now()))?.file.tasks.map((task) => task.title) ?? [];

/** The account's side: what it holds, and what it was asked to do. */
function account(held: ExportFile, options: { refuse?: string } = {}) {
	const calls: { move: [MoveMode, string][]; restore: number[]; keys: string[] } = {
		move: [],
		restore: [],
		keys: []
	};
	tasker.account.email = EMAIL;
	tasker.backend = {
		data: { export: async () => held },
		account: {
			async move(_file: ExportFile, mode: MoveMode, today: string): Promise<MoveResult> {
				if (options.refuse) throw new BackendError(options.refuse, 400);
				calls.move.push([mode, today]);
				return { tasks: _file.tasks.length, skipped: 0, alarms: 0, snapshotId: 9 };
			},
			async restore(id: number) {
				calls.restore.push(id);
				return { tasks: 0, skipped: 0, alarms: 0, snapshotId: 10 };
			},
			snapshots: async () => []
		},
		settings: {
			load: async () => tasker.settings,
			saveKey: async (key: string) => void calls.keys.push(key)
		},
		tasks: { since: async () => [] }
	} as unknown as Backend;
	return calls;
}

beforeEach(() => {
	dismissToast();
	tasker.move = { comparison: null, hasKey: false, busy: false, error: null };
	tasker.account.email = EMAIL;
});

afterEach(() => {
	tasker.backend = remoteBackend;
	tasker.account.email = null;
	dismissToast();
	if (original) Object.defineProperty(globalThis, 'indexedDB', original);
	else Reflect.deleteProperty(globalThis, 'indexedDB');
});

describe('checkMove', () => {
	test('a device without a plan asks nothing and moves nothing', async () => {
		await guestDevice([]);
		const calls = account(file());
		await checkMove();
		expect(tasker.move.comparison).toBeNull();
		expect(calls.move).toEqual([]);
	});

	test('a new account takes the plan without a question and tells it with an undo', async () => {
		await guestDevice(['Write intro', 'Call dentist']);
		const calls = account(file());
		await checkMove();
		expect(calls.move).toEqual([['both', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]]);
		expect(tasker.move.comparison).toBeNull();
		expect(tasker.toast?.message).toBe('Your plan is now in your account: 2 tasks.');
		expect(tasker.toast?.undo).toBeFunction();
		// The account has it, so the device no longer holds it, but keeps a copy
		expect(await deviceTitles()).toEqual([]);
		expect((await readBackup(Date.now()))?.file.tasks).toHaveLength(2);
	});

	test('an account that has a plan gets the move screen and nothing is written', async () => {
		await guestDevice(['Write intro']);
		const calls = account(file([{ title: 'Standup', startTime: 560 }]));
		await checkMove();
		// Read through JSON: the state is a proxy that the matcher does not look into
		expect(JSON.parse(JSON.stringify(tasker.move.comparison))).toMatchObject({
			device: { tasks: 1 },
			account: { tasks: 1 },
			clashes: [{ date: '2026-10-14' }]
		});
		expect(calls.move).toEqual([]);
		expect(await deviceTitles()).toEqual(['Write intro']);
	});

	test('the plan of a visitor who chose the account is not asked about again', async () => {
		await guestDevice(['Write intro']);
		await declineMove(EMAIL);
		const calls = account(file([{ title: 'Standup' }]));
		await checkMove();
		expect(tasker.move.comparison).toBeNull();
		expect(calls.move).toEqual([]);
	});

	test('a choice made for another account does not count for this one', async () => {
		await guestDevice(['Write intro']);
		await declineMove('someone@else.com');
		account(file([{ title: 'Standup' }]));
		await checkMove();
		expect(tasker.move.comparison).not.toBeNull();
	});

	test('a guest page does nothing', async () => {
		await guestDevice(['Write intro']);
		const calls = account(file());
		tasker.account.email = null;
		await checkMove();
		expect(calls.move).toEqual([]);
	});

	test('a browser that blocks storage changes nothing and does not throw', async () => {
		const quiet = spyOn(console, 'error').mockImplementation(() => {});
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			get() {
				throw new Error('blocked');
			}
		});
		account(file());
		await checkMove();
		expect(tasker.move.comparison).toBeNull();
		expect(quiet).toHaveBeenCalled();
		quiet.mockRestore();
	});

	test('a move the account refuses keeps the plan on the device and says why', async () => {
		await guestDevice(['Write intro']);
		account(file(), { refuse: 'Task 1 is not valid: broken' });
		await checkMove();
		expect(tasker.toast?.message).toContain('Task 1 is not valid: broken');
		expect(tasker.toast?.message).toContain('still on this device');
		expect(await deviceTitles()).toEqual(['Write intro']);
	});
});

describe('chooseMove', () => {
	async function asking(titles = ['Write intro'], key: string | null = null) {
		await guestDevice(titles, key);
		const calls = account(file([{ title: 'Standup', startTime: 560 }]));
		await checkMove();
		return calls;
	}

	test('keep both adds the plan to the account, then the device lets go of it', async () => {
		const calls = await asking();
		await chooseMove('both');
		expect(calls.move.map(([mode]) => mode)).toEqual(['both']);
		expect(tasker.move.comparison).toBeNull();
		expect(await deviceTitles()).toEqual([]);
		expect(tasker.toast?.message).toContain('Your plan is now in your account');
	});

	test("keep this device's replaces the plan of the account", async () => {
		const calls = await asking();
		await chooseMove('device');
		expect(calls.move.map(([mode]) => mode)).toEqual(['replace']);
	});

	test('keep my account leaves this device alone, and says it stays', async () => {
		const calls = await asking();
		await chooseMove('account');
		expect(calls.move).toEqual([]);
		expect(await deviceTitles()).toEqual(['Write intro']);
		expect((await readDevice(Date.now()))?.declinedFor).toBe(EMAIL);
		expect(tasker.move.comparison).toBeNull();
		expect(tasker.toast?.message).toContain('stays on this device');
	});

	test('the OpenAI key goes to the account only when it is ticked', async () => {
		const without = await asking(['A'], 'sk-mine');
		await chooseMove('both', false);
		expect(without.keys).toEqual([]);

		const withKey = await asking(['B'], 'sk-mine');
		await chooseMove('both', true);
		expect(withKey.keys).toEqual(['sk-mine']);
	});

	test('a refusal keeps the screen open with the reason and the device untouched', async () => {
		await guestDevice(['Write intro']);
		const calls = account(file([{ title: 'Standup' }]), { refuse: 'Could not move the plan' });
		await checkMove();
		await chooseMove('both');
		expect(tasker.move.comparison).not.toBeNull();
		expect(tasker.move.error).toContain('Could not move the plan');
		expect(tasker.move.busy).toBe(false);
		expect(calls.move).toEqual([]);
		expect(await deviceTitles()).toEqual(['Write intro']);
	});

	test('a second tap while the move runs does nothing', async () => {
		const calls = await asking();
		tasker.move.busy = true;
		await chooseMove('both');
		expect(calls.move).toEqual([]);
	});
});

describe('undoing a move', () => {
	test('restores the account, brings the plan back to the device and does not ask again', async () => {
		await guestDevice(['Write intro']);
		const calls = account(file());
		await checkMove();
		expect(await deviceTitles()).toEqual([]);

		await tasker.toast!.undo!();
		expect(calls.restore).toEqual([9]);
		expect(await deviceTitles()).toEqual(['Write intro']);
		expect((await readDevice(Date.now()))?.declinedFor).toBe(EMAIL);
		expect(tasker.toast?.message).toContain('The move is undone');

		// The next load does not move it again
		await checkMove();
		expect(calls.move).toHaveLength(1);
	});
});
