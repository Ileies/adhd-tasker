/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import {
	ERASE_WINDOW_MS,
	accountSnapshots,
	deviceBackupLabel,
	downloadExport,
	eraseSoon,
	importFile,
	restoreAccountSnapshot,
	restoreDeviceBackup
} from '#lib/data.js';
import { openLocalDb } from '#lib/local/db.js';
import { clearDevice, readDevice } from '#lib/local/device.js';
import { localRepo } from '#lib/local/repo.js';
import { DATABASE_NAME } from '#lib/local/runtime.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';
import { Priority } from '#lib/types.js';
import { freshIndexedDb } from '#test/idb.js';

const original = globalThis.location;
let reloads = 0;

beforeEach(() => {
	reloads = 0;
	Object.assign(globalThis, { location: { reload: () => void reloads++ } });
});

afterEach(() => {
	jest.useRealTimers();
	tasker.backend = remoteBackend;
	dismissToast();
	Object.assign(globalThis, { location: original });
});

const useBackend = (data: Partial<Backend['data']>, rest: Partial<Backend> = {}) => {
	tasker.backend = {
		data,
		settings: { load: async () => tasker.settings },
		tasks: { since: async () => [] },
		schedule: { load: async () => null },
		...rest
	} as unknown as Backend;
};

describe('importFile', () => {
	test('imports the parsed file and answers the sentence', async () => {
		const seen: unknown[] = [];
		useBackend({
			import: async (raw) => {
				seen.push(raw);
				return { tasks: 3, skipped: 1, alarms: 0, todos: 0 };
			}
		});
		const result = await importFile(new File(['{"app":"adhd-tasker"}'], 'plan.json'));
		expect(result).toEqual({
			ok: true,
			message: 'Imported 3 tasks. 1 task already here, left alone.'
		});
		expect(seen).toEqual([{ app: 'adhd-tasker' }]);
	});

	test('the screens read the plan again after an import', async () => {
		let reads = 0;
		useBackend(
			{ import: async () => ({ tasks: 1, skipped: 0, alarms: 0, todos: 0 }) },
			{ tasks: { since: async () => (reads++, []) } as unknown as Backend['tasks'] }
		);
		await importFile(new File(['{}'], 'plan.json'));
		expect(reads).toBe(1);
	});

	test('a file that is not JSON is refused before anything is sent', async () => {
		let sent = 0;
		useBackend({ import: async () => (sent++, { tasks: 0, skipped: 0, alarms: 0, todos: 0 }) });
		expect(await importFile(new File(['not json'], 'plan.json'))).toEqual({
			ok: false,
			message: 'That file is not a valid export, it is not JSON'
		});
		expect(sent).toBe(0);
	});

	test('a refusal from the backend says why', async () => {
		useBackend({
			import: async () => {
				throw new BackendError('This is not an ADHD Tasker export file', 400);
			}
		});
		expect(await importFile(new File(['{}'], 'plan.json'))).toEqual({
			ok: false,
			message: 'This is not an ADHD Tasker export file'
		});
	});

	test('a lost connection says so', async () => {
		useBackend({
			import: async () => {
				throw new BackendError('Could not reach the server.', null);
			}
		});
		expect((await importFile(new File(['{}'], 'plan.json'))).message).toBe('No connection');
	});
});

describe('downloadExport', () => {
	test('says why when the export could not be made', async () => {
		useBackend({
			export: async () => {
				throw new BackendError('Login required', 401);
			}
		});
		expect(await downloadExport()).toBe('Could not export: Login required');
	});
});

describe('the copy of a plan that moved into an account', () => {
	const indexedDbOriginal = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

	afterEach(() => {
		if (indexedDbOriginal) Object.defineProperty(globalThis, 'indexedDB', indexedDbOriginal);
		else Reflect.deleteProperty(globalThis, 'indexedDB');
	});

	/** A device that moved its plan one day ago. */
	async function movedDevice() {
		const factory = freshIndexedDb();
		Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
		const db = await openLocalDb(factory, DATABASE_NAME);
		await localRepo(db).tasks.insert({
			title: 'Write intro',
			description: '',
			date: '2026-10-14',
			startTime: 540,
			duration: 60,
			priority: Priority.Medium
		});
		db.close();
		const found = (await readDevice(Date.now()))!;
		await clearDevice(found.file, Date.now());
	}

	test('is offered while it is kept, with what it holds', async () => {
		expect(await deviceBackupLabel()).toBeNull();
		await movedDevice();
		expect(await deviceBackupLabel()).toMatch(
			/^Restore the plan that moved into your account on \d{1,2} \w{3} \(1 task\)$/
		);
	});

	test('restoring brings the plan back and reloads the page that reads it', async () => {
		await movedDevice();
		expect(await restoreDeviceBackup()).toBeNull();
		expect(reloads).toBe(1);
		expect((await readDevice(Date.now()))?.file.tasks).toHaveLength(1);
		expect(await deviceBackupLabel()).toBeNull();
	});

	test('says so when there is no copy any more, and does not reload', async () => {
		freshDevice();
		expect(await restoreDeviceBackup()).toBe('There is no copy to restore any more');
		expect(reloads).toBe(0);
	});

	function freshDevice() {
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			value: freshIndexedDb()
		});
	}
});

describe('the account snapshots', () => {
	test('are listed with the sentence for each, newest first', async () => {
		useBackend(
			{},
			{
				account: {
					snapshots: async () => [
						{ id: 4, createdAt: Date.UTC(2026, 9, 14, 12), tasks: 48, alarms: 3 }
					]
				} as unknown as Backend['account']
			}
		);
		tasker.timezone = 'UTC';
		expect(await accountSnapshots()).toEqual([
			{ id: 4, label: 'Restore the plan from before 14 Oct (48 tasks, 3 alarms)' }
		]);
		tasker.timezone = null;
	});

	test('a list that cannot be read is an empty one', async () => {
		useBackend(
			{},
			{
				account: {
					snapshots: async () => {
						throw new BackendError('Could not reach the server.', null);
					}
				} as unknown as Backend['account']
			}
		);
		expect(await accountSnapshots()).toEqual([]);
	});

	test('restoring one reads the plan again, a refusal says why', async () => {
		let reads = 0;
		const restored: number[] = [];
		useBackend(
			{},
			{
				tasks: { since: async () => (reads++, []) } as unknown as Backend['tasks'],
				account: {
					restore: async (id: number) => void restored.push(id)
				} as unknown as Backend['account']
			}
		);
		expect(await restoreAccountSnapshot(4)).toBeNull();
		expect(restored).toEqual([4]);
		expect(reads).toBe(1);

		useBackend(
			{},
			{
				account: {
					restore: async () => {
						throw new BackendError('That plan is no longer kept', 404);
					}
				} as unknown as Backend['account']
			}
		);
		expect(await restoreAccountSnapshot(4)).toBe('Could not restore: That plan is no longer kept');
	});
});

describe('eraseSoon', () => {
	test('for an account it says what goes, and afterwards Google must not sign the visitor in again', async () => {
		jest.useFakeTimers();
		let erased = 0;
		tasker.account.email = 'ada@example.com';
		useBackend({ erase: async () => void erased++ });
		eraseSoon();
		expect(tasker.toasts.at(-1)?.message).toBe('Your account and everything in it will be deleted');
		jest.advanceTimersByTime(ERASE_WINDOW_MS);
		await Promise.resolve();
		await Promise.resolve();
		tasker.account.email = null;
		expect(erased).toBe(1);
		expect(reloads).toBe(1);
	});
});

describe('eraseSoon', () => {
	test('offers an Undo and deletes only after the window, then starts again from empty', async () => {
		jest.useFakeTimers();
		let erased = 0;
		useBackend({ erase: async () => void erased++ });
		eraseSoon();
		expect(tasker.toasts.at(-1)?.message).toBe('Everything on this device will be deleted');
		jest.advanceTimersByTime(ERASE_WINDOW_MS - 1);
		expect(erased).toBe(0);
		jest.advanceTimersByTime(1);
		await Promise.resolve();
		await Promise.resolve();
		expect(erased).toBe(1);
		expect(reloads).toBe(1);
	});

	test('the Undo inside the window keeps everything', async () => {
		jest.useFakeTimers();
		let erased = 0;
		useBackend({ erase: async () => void erased++ });
		eraseSoon();
		tasker.toasts.at(-1)?.undo?.();
		jest.advanceTimersByTime(ERASE_WINDOW_MS * 2);
		await Promise.resolve();
		expect(erased).toBe(0);
		expect(reloads).toBe(0);
	});

	test('a second click while one is waiting does not start another', async () => {
		jest.useFakeTimers();
		let erased = 0;
		useBackend({ erase: async () => void erased++ });
		eraseSoon();
		eraseSoon();
		jest.advanceTimersByTime(ERASE_WINDOW_MS);
		await Promise.resolve();
		await Promise.resolve();
		expect(erased).toBe(1);
	});

	test('a failed deletion says why and does not reload', async () => {
		jest.useFakeTimers();
		useBackend({
			erase: async () => {
				throw new BackendError('Nothing to delete on this device', 400);
			}
		});
		eraseSoon();
		jest.advanceTimersByTime(ERASE_WINDOW_MS);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(tasker.toasts.at(-1)?.message).toBe(
			'Could not delete: Nothing to delete on this device'
		);
		expect(reloads).toBe(0);
	});
});
