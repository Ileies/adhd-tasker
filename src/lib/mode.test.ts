/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import { openLocalDb } from '#lib/local/db.js';
import { declineMove, readDevice } from '#lib/local/device.js';
import { localRepo } from '#lib/local/repo.js';
import { DATABASE_NAME } from '#lib/local/runtime.js';
import { beginGuest, STORAGE_PROBLEM, useAccount } from '#lib/mode.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { todayIn } from '#lib/time.js';
import { Priority } from '#lib/types.js';
import { freshIndexedDb } from '#test/idb.js';

const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const useFactory = (factory: unknown) =>
	Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });

const stops: (() => void)[] = [];
const guest = () => {
	const stop = beginGuest();
	stops.push(stop);
	return stop;
};

/** Waits until the page would stop showing its loading state. */
async function ready() {
	for (let i = 0; i < 200 && !tasker.account.ready; i++) await Bun.sleep(10);
}

beforeEach(() => {
	tasker.account.ready = false;
	tasker.account.problem = null;
	tasker.account.email = null;
	tasker.tasks = [];
});

afterEach(() => {
	stops.splice(0).forEach((stop) => stop());
	if (original) Object.defineProperty(globalThis, 'indexedDB', original);
	else delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe('useAccount', () => {
	test('hands the page to this server with the plan the layout load carried', () => {
		useAccount('ada@example.com', { ...DEFAULT_SETTINGS, hasOpenaiKey: true } as never, []);
		// The state proxy wraps what is stored, so compare what the backend does, not its identity
		expect(tasker.backend.tasks.since.toString()).toBe(remoteBackend.tasks.since.toString());
		expect(tasker.account.email).toBe('ada@example.com');
		expect(tasker.settings.hasOpenaiKey).toBe(true);
		expect(tasker.account.ready).toBe(true);
	});
});

describe('beginGuest', () => {
	test('opens the plan on this device and is ready when it was read', async () => {
		const factory = freshIndexedDb();
		useFactory(factory);
		const db = await openLocalDb(factory, DATABASE_NAME);
		await localRepo(db).tasks.insert({
			title: 'Write intro',
			description: '',
			date: todayIn('UTC'),
			startTime: 540,
			duration: 60,
			priority: Priority.Medium
		});
		db.close();
		guest();
		await ready();
		expect(tasker.account.email).toBeNull();
		expect(tasker.account.problem).toBeNull();
		expect(tasker.tasks.map((task) => task.title)).toEqual(['Write intro']);
	});

	test('forgets that the user kept their account plan, so the next sign in asks anew', async () => {
		const factory = freshIndexedDb();
		useFactory(factory);
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
		await declineMove('ada@example.com', factory);
		expect((await readDevice(Date.now(), factory))?.declinedFor).toBe('ada@example.com');

		guest();
		await ready();
		await Bun.sleep(50);
		expect((await readDevice(Date.now(), factory))?.declinedFor).toBeNull();
	});

	test('says so when the browser refuses storage, instead of showing a plan that would vanish', async () => {
		useFactory({
			open() {
				throw new Error('denied');
			}
		});
		const log = spyOn(console, 'error').mockImplementation(() => {});
		guest();
		await ready();
		log.mockRestore();
		expect(tasker.account.problem).toBe(STORAGE_PROBLEM);
		expect(tasker.account.ready).toBe(true);
	});

	test('a screen that asks before storage answered gets the same refusal', async () => {
		useFactory({
			open() {
				throw new Error('denied');
			}
		});
		const log = spyOn(console, 'error').mockImplementation(() => {});
		guest();
		const refusal = await tasker.backend.tasks.since('2026-10-01').catch((error: unknown) => error);
		expect(refusal).toMatchObject({ status: 503 });
		await ready();
		log.mockRestore();
	});
});
