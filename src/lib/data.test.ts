/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { ERASE_WINDOW_MS, downloadExport, eraseSoon, importFile } from '#lib/data.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';

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
				return { tasks: 3, skipped: 1, alarms: 0 };
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
			{ import: async () => ({ tasks: 1, skipped: 0, alarms: 0 }) },
			{ tasks: { since: async () => (reads++, []) } as unknown as Backend['tasks'] }
		);
		await importFile(new File(['{}'], 'plan.json'));
		expect(reads).toBe(1);
	});

	test('a file that is not JSON is refused before anything is sent', async () => {
		let sent = 0;
		useBackend({ import: async () => (sent++, { tasks: 0, skipped: 0, alarms: 0 }) });
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

describe('eraseSoon', () => {
	test('offers an Undo and deletes only after the window, then starts again from empty', async () => {
		jest.useFakeTimers();
		let erased = 0;
		useBackend({ erase: async () => void erased++ });
		eraseSoon();
		expect(tasker.toast?.message).toBe('Everything on this device will be deleted');
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
		tasker.toast?.undo?.();
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
		expect(tasker.toast?.message).toBe('Could not delete: Nothing to delete on this device');
		expect(reloads).toBe(0);
	});
});
