/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { DELETE, PUT } from './+server.js';
import { readOpenaiKey } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const MODELS = 'GET https://api.openai.com/v1/models';
const accepted = () => fakeFetch({ [MODELS]: () => Response.json({ data: [] }) });

describe('PUT /settings/openai-key', () => {
	test('needs a login', async () => {
		expect((await callRoute(PUT, { body: { key: 'sk-x' } })).status).toBe(401);
	});

	test('stores an accepted key encrypted, the plain key is not in the row', async () => {
		const user = await makeUser();
		accepted();
		expect((await callRoute(PUT, { user, body: { key: ' sk-secret ' } })).status).toBe(200);
		const { openaiKey } = await dbRepo(TEST_EMAIL).settings.get();
		expect(openaiKey).not.toBeNull();
		expect(openaiKey).not.toContain('sk-secret');
		expect(readOpenaiKey(openaiKey)).toBe('sk-secret');
	});

	test('a key OpenAI refuses is not stored and the reason comes back', async () => {
		const user = await makeUser();
		fakeFetch({ [MODELS]: () => new Response('no', { status: 401 }) });
		const result = await callRoute(PUT, { user, body: { key: 'sk-bad' } });
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ message: 'OpenAI did not accept this key' });
		expect((await dbRepo(TEST_EMAIL).settings.get()).openaiKey).toBeNull();
	});

	test.each([
		['an empty key', { key: '' }],
		['no key', {}],
		['a key that is not text', { key: 5 }]
	])('%s gives 400 without asking OpenAI', async (_name, body) => {
		const user = await makeUser();
		const { requests } = fakeFetch({});
		expect((await callRoute(PUT, { user, body })).status).toBe(400);
		expect(requests).toEqual([]);
	});

	test('an unreachable OpenAI gives 502', async () => {
		const user = await makeUser();
		fakeFetch({
			[MODELS]: () => {
				throw new Error('offline');
			}
		});
		expect((await callRoute(PUT, { user, body: { key: 'sk-x' } })).status).toBe(502);
	});
});

describe('DELETE /settings/openai-key', () => {
	test('needs a login', async () => {
		expect((await callRoute(DELETE)).status).toBe(401);
	});

	test('removes the saved key', async () => {
		const user = await makeUser();
		accepted();
		await callRoute(PUT, { user, body: { key: 'sk-secret' } });
		expect((await callRoute(DELETE, { user })).status).toBe(200);
		expect((await dbRepo(TEST_EMAIL).settings.get()).openaiKey).toBeNull();
	});
});
