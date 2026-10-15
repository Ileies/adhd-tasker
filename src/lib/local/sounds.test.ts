/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { freshIndexedDb } from '#test/idb.js';
import { openSoundsDb, readSounds, removeSound, saveSound } from '#lib/local/sounds.js';

let factory = freshIndexedDb();
beforeEach(() => {
	factory = freshIndexedDb();
});

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('replaced sounds', () => {
	test('a new database has none', async () => {
		const db = await openSoundsDb(factory);
		expect(await readSounds(db)).toEqual([]);
	});

	test('a saved sound comes back with its name and bytes', async () => {
		const db = await openSoundsDb(factory);
		await saveSound(db, { slot: 'done', name: 'bell.mp3', data: bytes(1, 2, 3) });
		const [sound] = await readSounds(db);
		expect(sound.slot).toBe('done');
		expect(sound.name).toBe('bell.mp3');
		expect([...new Uint8Array(sound.data)]).toEqual([1, 2, 3]);
	});

	test('saving a slot again replaces it', async () => {
		const db = await openSoundsDb(factory);
		await saveSound(db, { slot: 'done', name: 'a.mp3', data: bytes(1) });
		await saveSound(db, { slot: 'done', name: 'b.mp3', data: bytes(2) });
		const sounds = await readSounds(db);
		expect(sounds.map((s) => s.name)).toEqual(['b.mp3']);
	});

	test('removing a slot leaves the others', async () => {
		const db = await openSoundsDb(factory);
		await saveSound(db, { slot: 'done', name: 'a.mp3', data: bytes(1) });
		await saveSound(db, { slot: 'reminder', name: 'b.mp3', data: bytes(2) });
		await removeSound(db, 'done');
		expect((await readSounds(db)).map((s) => s.slot)).toEqual(['reminder']);
	});

	test('a record under an unknown slot is ignored', async () => {
		const db = await openSoundsDb(factory);
		await saveSound(db, { slot: 'bogus' as never, name: 'x.mp3', data: bytes(1) });
		expect(await readSounds(db)).toEqual([]);
	});
});
