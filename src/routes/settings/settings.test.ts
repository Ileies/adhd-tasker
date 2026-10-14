/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { PUT } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

describe('PUT /settings', () => {
	test('needs a login', async () => {
		expect((await callRoute(PUT, { body: { showClock: true } })).status).toBe(401);
	});

	test('saves the given settings and leaves the others alone', async () => {
		const user = await makeUser();
		const before = await dbRepo(TEST_EMAIL).settings.get();
		const result = await callRoute(PUT, { user, body: { showClock: true, overrunMinutes: 30 } });
		expect(result.status).toBe(200);
		expect(await dbRepo(TEST_EMAIL).settings.get()).toEqual({
			...before,
			showClock: true,
			overrunMinutes: 30
		});
	});

	test.each([
		['an unknown setting', { openaiKey: 'sk-x' }],
		['a value out of range', { reminderAdvanceTime: 0 }],
		['a value of the wrong type', { voiceReplies: 'yes' }],
		['nothing', {}]
	])('%s gives 400 and changes nothing', async (_name, body) => {
		const user = await makeUser();
		const before = await dbRepo(TEST_EMAIL).settings.get();
		expect((await callRoute(PUT, { user, body })).status).toBe(400);
		expect(await dbRepo(TEST_EMAIL).settings.get()).toEqual(before);
	});
});
