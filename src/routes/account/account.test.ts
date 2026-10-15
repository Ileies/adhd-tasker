/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { DELETE } from './+server.js';
import { POST as importPlan } from './import/+server.js';
import { POST as restore } from './restore/+server.js';
import { GET as snapshots } from './snapshots/+server.js';
import { EXPORT_APP, EXPORT_VERSION } from '#lib/core/export.js';
import { db } from '#lib/server/db/index.js';
import * as schema from '#lib/server/db/schema.js';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeTask, makeUser, requestEvent } from '#test/fixtures.js';
import { eq, getTableColumns } from 'drizzle-orm';
import { is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

beforeEach(resetDb);

const task = (title: string, date = '2026-10-14', startTime = 540) => ({
	title,
	description: '',
	date,
	startTime,
	duration: 60,
	priority: 3,
	status: 'pending'
});
const file = (tasks: unknown[] = [], alarms: unknown[] = []) => ({
	app: EXPORT_APP,
	version: EXPORT_VERSION,
	exportedAt: 0,
	settings: {},
	tasks,
	alarms
});
const move = (body: unknown, user?: Awaited<ReturnType<typeof makeUser>>) =>
	callRoute(importPlan, { user, body });

describe('POST /account/import', () => {
	test('needs a login', async () => {
		expect((await move({ mode: 'both', today: '2026-10-14', file: file() })).status).toBe(401);
	});

	test('moves the plan and answers what it did and which snapshot holds the old plan', async () => {
		const user = await makeUser();
		const result = await move(
			{ mode: 'both', today: '2026-10-14', file: file([task('Write intro')]) },
			user
		);
		expect(result).toMatchObject({
			status: 200,
			body: { tasks: 1, skipped: 0, alarms: 0, snapshotId: 1 }
		});
	});

	test.each([
		['a mode that does not exist', { mode: 'merge', today: '2026-10-14', file: file() }],
		['no day', { mode: 'both', file: file() }],
		['a day that is not a date', { mode: 'both', today: 'soon', file: file() }],
		['no file', { mode: 'both', today: '2026-10-14' }]
	])('refuses %s', async (_name, body) => {
		const user = await makeUser();
		expect((await move(body, user)).status).toBe(400);
	});

	test('one invalid row refuses the whole file with the reason and writes nothing', async () => {
		const user = await makeUser();
		await makeTask({ title: 'Mine' });
		const result = await move(
			{
				mode: 'replace',
				today: '2026-10-14',
				file: file([task('Fine'), { ...task('Broken'), duration: -5 }])
			},
			user
		);
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ message: expect.stringContaining('Task 2 is not valid') });
		expect(
			db
				.select()
				.from(schema.tasks)
				.all()
				.map((row) => row.title)
		).toEqual(['Mine']);
		expect(db.select().from(schema.planSnapshots).all()).toEqual([]);
	});

	test('tells the open screens when alarms came in', async () => {
		const user = await makeUser();
		const heard: StreamMessage[] = [];
		const stop = subscribe(TEST_EMAIL, 'tab', (message) => void heard.push(message));
		await move(
			{
				mode: 'both',
				today: '2026-10-14',
				file: file(
					[],
					[
						{
							fireAt: Date.now() + 86_400_000,
							minutes: null,
							repeat: 'none',
							label: 'Stretch',
							tone: 'chime',
							durationMin: 5
						}
					]
				)
			},
			user
		);
		stop();
		expect(heard).toContainEqual({ type: 'schedule' });
	});

	test('a full plan of 5000 tasks fits the request limit of the server', async () => {
		const tasks = Array.from({ length: 5000 }, (_, i) =>
			task(
				`Task number ${i} with a title of a normal length`,
				`2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
				i % 1300
			)
		);
		const body = JSON.stringify({ mode: 'both', today: '2026-10-14', file: file(tasks) });
		// The adapter reads `BODY_SIZE_LIMIT` from the environment the process runs in
		const spec = (await import('../../../pm2.config.cjs')).default as {
			env: { BODY_SIZE_LIMIT: string };
		};
		const limit = Number.parseInt(spec.env.BODY_SIZE_LIMIT) * 1024 * 1024;
		expect(new TextEncoder().encode(body).length).toBeLessThan(limit);

		const user = await makeUser();
		const result = await move(JSON.parse(body), user);
		expect(result).toMatchObject({ status: 200, body: { tasks: 5000 } });
	});
});

describe('GET /account/snapshots and POST /account/restore', () => {
	test('both need a login', async () => {
		expect((await callRoute(snapshots)).status).toBe(401);
		expect((await callRoute(restore, { body: { id: 1 } })).status).toBe(401);
	});

	test('a replace leaves a snapshot that restore brings back', async () => {
		const user = await makeUser();
		await makeTask({ title: 'Old' });
		await move(
			{ mode: 'replace', today: '2026-10-14', file: file([task('New', '2026-10-14', 700)]) },
			user
		);
		const listed = await callRoute(snapshots, { user });
		expect(listed.body).toMatchObject([{ id: 1, tasks: 1, alarms: 0 }]);

		const result = await callRoute(restore, { user, body: { id: 1 } });
		expect(result.status).toBe(200);
		expect(
			db
				.select()
				.from(schema.tasks)
				.all()
				.map((row) => row.title)
		).toEqual(['Old']);
	});

	test('a snapshot that is not there answers 404 and a body without an id 400', async () => {
		const user = await makeUser();
		expect((await callRoute(restore, { user, body: { id: 7 } })).status).toBe(404);
		expect((await callRoute(restore, { user, body: { id: 'x' } })).status).toBe(400);
	});
});

describe('DELETE /account', () => {
	const REVOKE = 'POST https://oauth2.googleapis.com/revoke';

	test('needs a login', async () => {
		expect((await callRoute(DELETE)).status).toBe(401);
	});

	test('no row of the user is left in any table, and other accounts keep theirs', async () => {
		const user = await makeUser();
		fakeFetch({ [REVOKE]: () => new Response('{}') });
		await makeTask({ title: 'Mine' });
		await makeTask({ title: 'Theirs', email: 'other@example.com' });
		const repo = (await import('#lib/server/db-repo.js')).dbRepo(TEST_EMAIL);
		await repo.actions.record({
			tool: 'add_task',
			before: null,
			after: null,
			eventId: null,
			reason: null
		});
		await repo.events.insert({ type: 'task.switched', payload: {}, origin: 'user', createdAt: 1 });
		await repo.cards.show({ kind: 'say', text: 'Hi', createdAt: 1 });
		await repo.schedule.insert({
			kind: 'alarm',
			fireAt: 1,
			label: 'x',
			createdBy: 'user',
			createdAt: 1
		});
		await repo.usage.record('chat', 10, 1);
		await move({ mode: 'both', today: '2026-10-14', file: file([task('Moved')]) }, user);

		const event = requestEvent({ user, method: 'DELETE', cookies: { session: 's', token: 't' } });
		const result = await callRoute(DELETE, event);
		expect(result.status).toBe(204);
		expect(event.cookies.jar.size).toBe(0);

		// Every table that holds a user's rows has an `email` column
		const owned = Object.values(schema as Record<string, unknown>)
			.filter((value): value is SQLiteTable => is(value, SQLiteTable))
			.filter((table) => 'email' in getTableColumns(table));
		expect(owned.length).toBeGreaterThanOrEqual(8);
		for (const table of owned) {
			const columns = getTableColumns(table) as Record<string, never>;
			expect(db.select().from(table).where(eq(columns.email, TEST_EMAIL)).all()).toEqual([]);
		}
		expect(
			db
				.select()
				.from(schema.tasks)
				.all()
				.map((row) => row.title)
		).toEqual(['Theirs']);
	});

	test('deletes the account even when Google cannot be reached to revoke the token', async () => {
		const user = await makeUser();
		fakeFetch({
			[REVOKE]: () => {
				throw new TypeError('fetch failed');
			}
		});
		const event = requestEvent({ user, method: 'DELETE', cookies: { token: 't' } });
		expect((await callRoute(DELETE, event)).status).toBe(204);
		expect(db.select().from(schema.users).all()).toEqual([]);
	});
});
