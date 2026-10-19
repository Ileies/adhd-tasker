/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { PUT } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

describe('PUT /settings/timezone', () => {
	test('needs a login', async () => {
		expect((await callRoute(PUT, { method: 'PUT', body: { timezone: 'UTC' } })).status).toBe(401);
	});

	test('saves a valid timezone', async () => {
		const user = await makeUser();
		const result = await callRoute(PUT, { user, method: 'PUT', body: { timezone: 'Asia/Tokyo' } });
		expect(result).toMatchObject({ status: 200, body: true });
		expect((await dbRepo(TEST_EMAIL).settings.get()).timezone).toBe('Asia/Tokyo');
	});

	test('refuses a name that is not a timezone and keeps the old one', async () => {
		const user = await makeUser();
		const result = await callRoute(PUT, { user, method: 'PUT', body: { timezone: 'Mars/Base' } });
		expect(result).toMatchObject({ status: 400, body: 'Invalid timezone' });
		expect((await dbRepo(TEST_EMAIL).settings.get()).timezone).toBe('Europe/Berlin');
	});
});
