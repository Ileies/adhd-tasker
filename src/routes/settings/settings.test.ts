/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET, PUT } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

describe('GET /settings', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('answers every setting, and for the key only whether one is saved', async () => {
		const user = await makeUser({ openaiKey: 'secret-ciphertext', showClock: true });
		const { status, body } = await callRoute(GET, { user });
		expect(status).toBe(200);
		expect(body).toMatchObject({ showClock: true, overrunMinutes: 15, hasOpenaiKey: true });
		expect(JSON.stringify(body)).not.toContain('secret-ciphertext');
		expect(body).not.toHaveProperty('openaiKey');
	});

	test('a user without a key has none', async () => {
		const user = await makeUser();
		expect((await callRoute(GET, { user })).body).toMatchObject({ hasOpenaiKey: false });
	});
});

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
