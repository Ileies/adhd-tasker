/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { freshIndexedDb } from '#test/idb.js';
import { describeRepo } from '#test/repo-contract.js';
import { openLocalDb } from '#lib/local/db.js';
import { localRepo } from '#lib/local/repo.js';

// One factory per test, like `resetDb`: tests of one file would otherwise share a database.
// A second user is a second database, a guest device only ever holds one.
let factory = freshIndexedDb();

describeRepo('local repo', {
	async reset() {
		factory = freshIndexedDb();
	},
	async open(email) {
		return localRepo(await openLocalDb(factory, `guest:${email}`), email);
	}
});

test('only the changed settings are stored, so a better default reaches old guests', async () => {
	const db = await openLocalDb(freshIndexedDb(), 'guest:partial');
	await localRepo(db).settings.update({ showClock: true });
	const raw = await new Promise((resolve) => {
		const request = db.transaction('settings').objectStore('settings').get('settings');
		request.onsuccess = () => resolve(request.result);
	});
	expect(raw).toEqual({ showClock: true });
});
