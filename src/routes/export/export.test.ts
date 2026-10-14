/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

describe('GET /export', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('answers the plan of that user as a download, in the export format', async () => {
		const user = await makeUser();
		await makeTask({ title: 'Mine' });
		await makeTask({ title: 'Not mine', email: 'other@example.com' });
		const { status, body, headers } = await callRoute(GET, { user });
		expect(status).toBe(200);
		expect(body).toMatchObject({ app: 'adhd-tasker', version: 1, tasks: [{ title: 'Mine' }] });
		expect(headers.get('content-disposition')).toMatch(
			/^attachment; filename="adhd-tasker-\d{4}-\d{2}-\d{2}\.json"$/
		);
		expect(headers.get('cache-control')).toBe('no-store');
	});

	test('never holds the OpenAI key', async () => {
		const user = await makeUser({ openaiKey: 'encrypted-key-material' });
		expect(await dbRepo(TEST_EMAIL).settings.get()).toMatchObject({
			openaiKey: 'encrypted-key-material'
		});
		const { body } = await callRoute(GET, { user });
		expect(JSON.stringify(body)).not.toContain('encrypted-key-material');
	});
});
