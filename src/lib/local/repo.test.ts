/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { freshIndexedDb } from '#test/idb.js';
import { describeRepo } from '#test/repo-contract.js';
import { UPGRADE_STEPS, openLocalDb, pendingSteps, type UpgradeStep } from '#lib/local/db.js';
import { localRepo } from '#lib/local/repo.js';
import { Priority } from '#lib/types.js';

// One factory per test, like `resetDb`: tests of one file would otherwise share a database.
// A second user is a second database, a guest device only ever holds one.
let factory = freshIndexedDb();
beforeEach(() => {
	factory = freshIndexedDb();
});

describeRepo('local repo', {
	async reset() {
		factory = freshIndexedDb();
	},
	async open(email) {
		return localRepo(await openLocalDb(factory, `guest:${email}`), email);
	}
});

const task = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: Priority.Medium
};

describe('upgrade steps', () => {
	test('a new database runs every step, an old one only the steps after its version', () => {
		const steps: UpgradeStep[] = [() => {}, () => {}, () => {}];
		expect(pendingSteps(steps, 0)).toHaveLength(3);
		expect(pendingSteps(steps, 1)).toEqual(steps.slice(1));
		expect(pendingSteps(steps, 3)).toEqual([]);
	});

	test('the data of an older version survives an app update that adds a step', async () => {
		const name = 'guest:upgrade';
		const first = localRepo(await openLocalDb(factory, name));
		const created = await first.tasks.insert(task);
		await first.settings.update({ showClock: true });

		let ran = 0;
		const next: UpgradeStep[] = [
			...UPGRADE_STEPS,
			(db) => {
				ran++;
				db.createObjectStore('later');
			}
		];
		const upgraded = await openLocalDb(factory, name, next);
		expect(ran).toBe(1);
		expect(upgraded.version).toBe(2);

		const repo = localRepo(upgraded);
		expect(await repo.tasks.get(created.id)).toEqual(created);
		expect((await repo.settings.get()).showClock).toBe(true);
	});

	test('a step that was already applied does not run again on the next open', async () => {
		let ran = 0;
		const steps: UpgradeStep[] = [...UPGRADE_STEPS, () => void ran++];
		await openLocalDb(factory, 'guest:twice', steps).then((db) => db.close());
		await openLocalDb(factory, 'guest:twice', steps);
		expect(ran).toBe(1);
	});
});

describe('local repo storage', () => {
	test('a write is there after the database is closed and opened again', async () => {
		const db = await openLocalDb(factory, 'guest:reopen');
		const created = await localRepo(db).tasks.insert(task);
		db.close();
		const again = localRepo(await openLocalDb(factory, 'guest:reopen'));
		expect(await again.tasks.get(created.id)).toEqual(created);
	});

	test('only the changed settings are stored, so a better default reaches old guests', async () => {
		const db = await openLocalDb(factory, 'guest:partial');
		await localRepo(db).settings.update({ showClock: true });
		const raw = await new Promise((resolve) => {
			const request = db.transaction('settings').objectStore('settings').get('settings');
			request.onsuccess = () => resolve(request.result);
		});
		expect(raw).toEqual({ showClock: true });
	});
});
