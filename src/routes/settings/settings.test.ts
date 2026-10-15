/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET, PUT } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { IP_LOOKUP_URL, resetLocationMemory } from '#lib/server/location.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
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

describe('PUT /settings location', () => {
	const city = {
		locationLat: 35.68,
		locationLon: 139.69,
		locationName: 'Tokyo, Japan',
		locationSource: 'city'
	} as const;
	const automatic = {
		locationLat: null,
		locationLon: null,
		locationName: null,
		locationSource: null
	};
	const headers = { 'x-forwarded-for': '93.184.216.34' };

	beforeEach(resetLocationMemory);

	test('saves a chosen place and does not ask the internet address service', async () => {
		const { requests } = fakeFetch({});
		const user = await makeUser();
		expect((await callRoute(PUT, { user, body: city, headers })).status).toBe(200);
		expect(await dbRepo(TEST_EMAIL).settings.get()).toMatchObject(city);
		expect(requests).toHaveLength(0);
	});

	test('a location of the server alone cannot be sent', async () => {
		const user = await makeUser();
		const body = { ...city, locationSource: 'ip' };
		expect((await callRoute(PUT, { user, body })).status).toBe(400);
	});

	test('detect automatically finds the place again from this visit', async () => {
		fakeFetch({
			[`${IP_LOOKUP_URL}/93.184.216.34`]: () =>
				Response.json({ success: true, latitude: 51.34, longitude: 12.37, city: 'Leipzig' })
		});
		const user = await makeUser({ ...city });
		expect((await callRoute(PUT, { user, body: automatic, headers })).status).toBe(200);
		expect(await dbRepo(TEST_EMAIL).settings.get()).toMatchObject({
			locationName: 'Leipzig',
			locationSource: 'ip'
		});
	});

	test('detect automatically with no lookup possible leaves the location empty', async () => {
		const user = await makeUser({ ...city });
		// The test request comes from 127.0.0.1, which no service can place
		expect((await callRoute(PUT, { user, body: automatic })).status).toBe(200);
		expect(await dbRepo(TEST_EMAIL).settings.get()).toMatchObject(automatic);
	});
});
