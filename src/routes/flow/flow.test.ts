/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET, POST } from './+server.js';
import { db } from '#lib/server/db/index.js';
import { flowLog } from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { TEST_DATE, TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const allRows = () => db.select().from(flowLog).all();

describe('GET /flow', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET, { url: `/flow?date=${TEST_DATE}` })).status).toBe(401);
	});

	test.each([
		['no date', ''],
		['a date that is not a date', '?date=today']
	])('%s gives 400', async (_name, query) => {
		const user = await makeUser();
		expect((await callRoute(GET, { user, url: `/flow${query}` })).status).toBe(400);
	});

	test('lists the rows of that day of that user only', async () => {
		const user = await makeUser();
		await makeUser({ email: 'other@example.com' });
		const now = Date.now();
		await db.insert(flowLog).values([
			{ email: TEST_EMAIL, at: now, date: TEST_DATE, type: 'rest', data: {} },
			{ email: TEST_EMAIL, at: now, date: '2026-10-13', type: 'rest', data: {} },
			{ email: 'other@example.com', at: now, date: TEST_DATE, type: 'rest', data: {} }
		]);
		const result = await callRoute(GET, { user, url: `/flow?date=${TEST_DATE}` });
		expect(result.body).toMatchObject([{ type: 'rest', date: TEST_DATE }]);
		expect(result.body as unknown[]).toHaveLength(1);
	});
});

describe('POST /flow', () => {
	test('needs a login', async () => {
		expect((await callRoute(POST, { body: { type: 'rest' } })).status).toBe(401);
		expect(allRows()).toEqual([]);
	});

	test('logs the answer for the user', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: { type: 'start', todoId: 4 } });
		expect(result.status).toBe(200);
		expect(allRows()).toMatchObject([{ email: TEST_EMAIL, type: 'start', todoId: 4 }]);
	});

	test('the owner comes from the login, never from the body', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: { type: 'rest', email: 'other@example.com' } });
		expect(allRows()[0].email).toBe(TEST_EMAIL);
	});

	test('a pin written twice is one row and the second answer is null', async () => {
		const user = await makeUser();
		const body = { type: 'pin', todoId: 4, key: 'pin:1000' };
		expect((await callRoute(POST, { user, body })).body).not.toBeNull();
		expect((await callRoute(POST, { user, body })).body).toBeNull();
		expect(allRows()).toHaveLength(1);
	});

	test.each([
		['no type', {}],
		['an unknown type', { type: 'dance' }],
		['a pin without its key', { type: 'pin' }]
	])('%s answers 400 and logs nothing', async (_name, body) => {
		const user = await makeUser();
		expect((await callRoute(POST, { user, body })).status).toBe(400);
		expect(allRows()).toEqual([]);
	});
});
