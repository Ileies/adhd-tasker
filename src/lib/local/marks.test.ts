/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { openLocalDb } from '#lib/local/db.js';
import { localMarks } from '#lib/local/marks.js';
import { localRepo } from '#lib/local/repo.js';
import { freshIndexedDb } from '#test/idb.js';

const open = async () => openLocalDb(freshIndexedDb(), 'marks');

describe('sample marks', () => {
	test('are empty on a new device', async () => {
		expect(await localMarks(await open()).read()).toEqual([]);
	});

	test('keep the ids that were written', async () => {
		const marks = localMarks(await open());
		await marks.write([3, 4, 5]);
		expect(await marks.read()).toEqual([3, 4, 5]);
	});

	test('writing none removes the record', async () => {
		const marks = localMarks(await open());
		await marks.write([1]);
		await marks.write([]);
		expect(await marks.read()).toEqual([]);
	});

	test('the routines have a record of their own', async () => {
		const marks = localMarks(await open());
		await marks.write([1, 2]);
		await marks.writeRoutines([7]);
		expect(await marks.readRoutines()).toEqual([7]);
		await marks.writeRoutines([]);
		expect(await marks.readRoutines()).toEqual([]);
		expect(await marks.read()).toEqual([1, 2]);
	});

	test('do not disturb the settings that share the store', async () => {
		const db = await open();
		await localRepo(db).settings.update({ showClock: true });
		await localMarks(db).write([1]);
		expect((await localRepo(db).settings.get()).showClock).toBe(true);
	});
});
