/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { POST as dismiss } from './cards/[id]/+server.js';
import { POST as stuck } from './stuck/+server.js';
import { GET } from './+server.js';
import { resetDb } from '#test/db.js';
import { callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

describe('GET /agent', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('answers the cursor and no card when the agent did nothing', async () => {
		const user = await makeUser();
		const result = await callRoute(GET, { user, url: '/agent?since=0' });
		expect(result).toMatchObject({ status: 200, body: { cards: [], changes: [] } });
	});
});

describe('POST /agent/cards/[id]', () => {
	test('needs a login', async () => {
		expect((await callRoute(dismiss, { method: 'POST', params: { id: '1' } })).status).toBe(401);
	});

	test('an id that is not a card id is refused with the reason', async () => {
		const user = await makeUser();
		expect(await callRoute(dismiss, { user, method: 'POST', params: { id: 'x' } })).toMatchObject({
			status: 400,
			body: { message: 'id must be a card id' }
		});
	});

	test('a card that is not open answers 404', async () => {
		const user = await makeUser();
		expect((await callRoute(dismiss, { user, method: 'POST', params: { id: '99' } })).status).toBe(
			404
		);
	});
});

describe('POST /agent/stuck', () => {
	test('needs a login', async () => {
		expect((await callRoute(stuck, { body: {} })).status).toBe(401);
	});

	test('a body without an item and a reason is refused', async () => {
		const user = await makeUser();
		expect((await callRoute(stuck, { user, method: 'POST' })).status).toBe(400);
	});

	test('a to-do that does not exist answers 404', async () => {
		const user = await makeUser();
		const result = await callRoute(stuck, {
			user,
			body: { todoId: 99, reason: 'cant-start' }
		});
		expect(result).toMatchObject({ status: 404, body: { message: 'No such to-do' } });
	});
});
