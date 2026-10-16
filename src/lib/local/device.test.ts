/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	BACKUP_DAYS,
	clearDevice,
	declineMove,
	forgetDecline,
	readBackup,
	readDevice,
	restoreBackup
} from '#lib/local/device.js';
import { openLocalDb } from '#lib/local/db.js';
import { localMarks } from '#lib/local/marks.js';
import { localRepo } from '#lib/local/repo.js';
import { Priority } from '#lib/types.js';
import { freshIndexedDb } from '#test/idb.js';

const NAME = 'device';
const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 24 * 60 * 60 * 1000;

const task = (title: string, date = '2026-10-14', startTime = 540) => ({
	title,
	description: '',
	date,
	startTime,
	duration: 60,
	priority: Priority.Medium
});

/** A device that was a guest: its database exists and holds what the test puts in it. */
async function device(
	fill: (repo: ReturnType<typeof localRepo>, db: IDBDatabase) => Promise<void> = async () => {}
) {
	const factory = freshIndexedDb();
	const db = await openLocalDb(factory, NAME);
	await fill(localRepo(db), db);
	db.close();
	return factory;
}

describe('readDevice', () => {
	test('a visitor who was never a guest has no device, and none is made', async () => {
		const factory = freshIndexedDb();
		expect(await readDevice(NOW, factory, NAME)).toBeNull();
		expect(await factory.databases()).toEqual([]);
	});

	test('a device without a task or an alarm has nothing to move', async () => {
		const factory = await device((repo) =>
			repo.settings.update({ showClock: true }).then(() => {})
		);
		expect(await readDevice(NOW, factory, NAME)).toBeNull();
	});

	test('holds the plan and the alarms in the export format, with the guest settings and key', async () => {
		const factory = await device(async (repo) => {
			await repo.tasks.insert(task('Write intro'));
			await repo.schedule.insert({
				kind: 'alarm',
				fireAt: NOW + DAY,
				label: 'Stretch',
				createdBy: 'user',
				createdAt: NOW
			});
			await repo.settings.update({ showClock: true, openaiKey: 'sk-mine' });
		});
		const found = await readDevice(NOW, factory, NAME);
		expect(found?.file.tasks.map((t) => t.title)).toEqual(['Write intro']);
		expect(found?.file.alarms.map((a) => a.label)).toEqual(['Stretch']);
		expect(found?.file.settings.showClock).toBe(true);
		expect(found?.openaiKey).toBe('sk-mine');
		expect(found?.declinedFor).toBeNull();
	});

	test('the file never holds the key', async () => {
		const factory = await device(async (repo) => {
			await repo.tasks.insert(task('A'));
			await repo.settings.update({ openaiKey: 'sk-mine' });
		});
		expect(JSON.stringify((await readDevice(NOW, factory, NAME))?.file)).not.toContain('sk-mine');
	});

	test('the sample day is left out, and a device with only the sample has nothing to move', async () => {
		const factory = await device(async (repo, db) => {
			const sample = await repo.tasks.insert(task('Sample'));
			await localMarks(db).write([sample.id]);
		});
		expect(await readDevice(NOW, factory, NAME)).toBeNull();

		const withOwn = await device(async (repo, db) => {
			const sample = await repo.tasks.insert(task('Sample'));
			await repo.tasks.insert(task('Mine', '2026-10-14', 700));
			await localMarks(db).write([sample.id]);
		});
		expect((await readDevice(NOW, withOwn, NAME))?.file.tasks.map((t) => t.title)).toEqual([
			'Mine'
		]);
	});
});

describe('declineMove', () => {
	test('is remembered until the visitor is signed out again', async () => {
		const factory = await device((repo) => repo.tasks.insert(task('A')).then(() => {}));
		await declineMove('ada@example.com', factory, NAME);
		expect((await readDevice(NOW, factory, NAME))?.declinedFor).toBe('ada@example.com');
		await forgetDecline(factory, NAME);
		expect((await readDevice(NOW, factory, NAME))?.declinedFor).toBeNull();
	});

	test('does nothing and creates nothing on a device that never was a guest', async () => {
		const factory = freshIndexedDb();
		await declineMove('ada@example.com', factory, NAME);
		await forgetDecline(factory, NAME);
		expect(await factory.databases()).toEqual([]);
	});
});

describe('clearDevice', () => {
	async function moved() {
		const factory = await device(async (repo, db) => {
			await repo.tasks.insert(task('Mine'));
			const sample = await repo.tasks.insert(task('Sample', '2026-10-14', 700));
			await localMarks(db).write([sample.id]);
			await repo.schedule.insert({
				kind: 'alarm',
				fireAt: NOW + DAY,
				label: 'x',
				createdBy: 'user',
				createdAt: NOW
			});
			await repo.cards.show({ kind: 'say', text: 'Hi', createdAt: 1 });
			await repo.usage.record('chat', 5, 1);
			await repo.settings.update({ showClock: true, openaiKey: 'sk-mine', lastCurrentTaskId: 7 });
		});
		const found = (await readDevice(NOW, factory, NAME))!;
		await declineMove('ada@example.com', factory, NAME);
		await clearDevice(found.file, NOW, factory, NAME);
		return { factory, file: found.file };
	}

	test('removes the plan, the alarms and the assistant log, the settings and the key stay', async () => {
		const { factory } = await moved();
		const db = await openLocalDb(factory, NAME);
		const repo = localRepo(db);
		expect(await repo.tasks.between('0000-01-01')).toEqual([]);
		expect(await repo.schedule.pending()).toEqual([]);
		expect(await repo.cards.open()).toBeNull();
		expect(await localMarks(db).read()).toEqual([]);
		expect(await repo.settings.get()).toMatchObject({
			showClock: true,
			openaiKey: 'sk-mine',
			lastCurrentTaskId: null
		});
		db.close();
		expect(await readDevice(NOW, factory, NAME)).toBeNull();
	});

	test('a routine moves with the plan, is removed from the device and comes back with a restore', async () => {
		const factory = await device(async (repo) => {
			const routine = await repo.routines.insert({
				title: 'Meds',
				priority: 3,
				startTime: 480,
				duration: 5,
				repeat: 'daily',
				firstDay: '2026-10-14'
			});
			await repo.tasks.insert({ ...task('Meds', '2026-10-14', 480), routineId: routine.id });
		});
		const found = (await readDevice(NOW, factory, NAME))!;
		expect(found.file.routines.map((routine) => routine.title)).toEqual(['Meds']);
		await clearDevice(found.file, NOW, factory, NAME);

		const emptied = await openLocalDb(factory, NAME);
		expect(await localRepo(emptied).routines.all()).toEqual([]);
		emptied.close();

		await restoreBackup(NOW + DAY, factory, NAME);
		const back = await openLocalDb(factory, NAME);
		const repo = localRepo(back);
		const [routine] = await repo.routines.all();
		expect(routine.title).toBe('Meds');
		expect((await repo.tasks.between('0000-01-01'))[0].routineId).toBe(routine.id);
		back.close();
	});

	test('keeps one copy of the plan for 30 days', async () => {
		const { factory, file } = await moved();
		expect(await readBackup(NOW + (BACKUP_DAYS - 1) * DAY, factory, NAME)).toEqual({
			file,
			at: NOW
		});
		expect(await readBackup(NOW + (BACKUP_DAYS + 1) * DAY, factory, NAME)).toBeNull();
		// An expired copy is gone, not only hidden
		expect(await readBackup(NOW, factory, NAME)).toBeNull();
	});

	test('restoring puts the plan and the alarms back and removes the copy', async () => {
		const { factory } = await moved();
		expect(await restoreBackup(NOW + DAY, factory, NAME)).toMatchObject({ tasks: 1, alarms: 1 });
		const found = await readDevice(NOW + DAY, factory, NAME);
		expect(found?.file.tasks.map((t) => t.title)).toEqual(['Mine']);
		expect(await readBackup(NOW + DAY, factory, NAME)).toBeNull();
		expect(await restoreBackup(NOW + DAY, factory, NAME)).toBeNull();
	});

	test('restoring twice in a row does not duplicate the plan', async () => {
		const { factory } = await moved();
		await restoreBackup(NOW + DAY, factory, NAME);
		await clearDevice((await readDevice(NOW + DAY, factory, NAME))!.file, NOW + DAY, factory, NAME);
		await restoreBackup(NOW + DAY, factory, NAME);
		expect((await readDevice(NOW + DAY, factory, NAME))?.file.tasks).toHaveLength(1);
	});
});
