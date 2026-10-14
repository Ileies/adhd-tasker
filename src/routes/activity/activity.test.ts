/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET } from './+server.js';
import { load } from './+page.server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser, requestEvent } from '#test/fixtures.js';

beforeEach(resetDb);

describe('GET /activity', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('answers the view of that user only', async () => {
		const user = await makeUser();
		await makeUser({ email: 'other@example.com' });
		await dbRepo(TEST_EMAIL).usage.record('chat', 25, Date.now());
		await dbRepo('other@example.com').usage.record('chat', 99, Date.now());
		const { status, body } = await callRoute(GET, { user });
		expect(status).toBe(200);
		expect(body).toMatchObject({ tokensToday: 25, actions: [], events: [] });
	});
});

describe('activity page load', () => {
	test('a guest gets no server view and is not redirected', async () => {
		const result = await load(requestEvent() as unknown as Parameters<typeof load>[0]);
		expect(result).toEqual({ activity: null });
	});

	test('an account gets its view', async () => {
		const user = await makeUser();
		const result = (await load(
			requestEvent({ user }) as unknown as Parameters<typeof load>[0]
		)) as {
			activity: { tokensToday: number };
		};
		expect(result.activity.tokensToday).toBe(0);
	});
});
