/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET } from './+server.js';
import { GEOCODE_URL } from '#lib/core/geocode.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
import { callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const leipzig = { name: 'Leipzig', latitude: 51.33962, longitude: 12.37129, country: 'Germany' };

describe('GET /settings/location', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET, { url: '/settings/location?q=Leipzig' })).status).toBe(401);
	});

	test('answers the cities that match the name', async () => {
		fakeFetch({ [GEOCODE_URL]: () => Response.json({ results: [leipzig] }) });
		const user = await makeUser();
		const { status, body } = await callRoute(GET, { user, url: '/settings/location?q=Leipzig' });
		expect(status).toBe(200);
		expect(body).toEqual([{ name: 'Leipzig, Germany', lat: 51.34, lon: 12.37 }]);
	});

	test('asks for a name when there is none', async () => {
		const user = await makeUser();
		expect((await callRoute(GET, { user, url: '/settings/location' })).status).toBe(400);
	});

	test('a search service that fails is a bad gateway', async () => {
		fakeFetch({ [GEOCODE_URL]: () => new Response('no', { status: 500 }) });
		const user = await makeUser();
		expect((await callRoute(GET, { user, url: '/settings/location?q=Leipzig' })).status).toBe(502);
	});
});
