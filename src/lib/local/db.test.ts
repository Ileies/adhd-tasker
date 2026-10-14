/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { freshIndexedDb } from '#test/idb.js';
import {
	UPGRADE_STEPS,
	openLocalDb,
	pendingSteps,
	transact,
	type UpgradeStep
} from '#lib/local/db.js';
import { localRepo } from '#lib/local/repo.js';
import { Priority } from '#lib/types.js';

let factory = freshIndexedDb();
beforeEach(() => {
	factory = freshIndexedDb();
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

describe('transact', () => {
	test('a write is there after the database is closed and opened again', async () => {
		const db = await openLocalDb(factory, 'guest:reopen');
		const created = await localRepo(db).tasks.insert(task);
		db.close();
		const again = localRepo(await openLocalDb(factory, 'guest:reopen'));
		expect(await again.tasks.get(created.id)).toEqual(created);
	});

	test('a throw inside aborts the whole transaction, nothing is half written', async () => {
		const db = await openLocalDb(factory, 'guest:abort');
		await expect(
			transact(db, ['tasks'], 'readwrite', async (tx) => {
				tx.objectStore('tasks').add({ ...task, status: 'pending' });
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(await localRepo(db).tasks.between('2000-01-01')).toEqual([]);
	});
});
