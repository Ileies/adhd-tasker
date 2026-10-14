/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { DELETE, GET, POST, PUT } from './+server.js';
import { db } from '#lib/server/db/index.js';
import { events, tasks } from '#lib/server/db/schema.js';
import { TaskStatus } from '#lib/types.js';
import { resetDb } from '#test/db.js';
import { TEST_DATE, TEST_EMAIL, callRoute, makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const valid = {
	title: 'Write intro',
	description: '',
	date: TEST_DATE,
	startTime: 9 * 60,
	duration: 60,
	priority: 3
};

const allTasks = () => db.select().from(tasks).all();
const allEvents = () => db.select().from(events).all();

describe('GET /edit', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET, { url: `/edit?date=${TEST_DATE}` })).status).toBe(401);
	});

	test.each([
		['no date', ''],
		['a date that is not a date', '?date=tomorrow']
	])('%s gives 400', async (_name, query) => {
		const user = await makeUser();
		expect((await callRoute(GET, { user, url: `/edit${query}` })).status).toBe(400);
	});

	test('returns only that day of that user', async () => {
		const user = await makeUser();
		const mine = await makeTask({ date: TEST_DATE });
		await makeTask({ date: '2026-10-15' });
		await makeTask({ date: TEST_DATE, email: 'other@example.com' });
		const result = await callRoute(GET, { user, url: `/edit?date=${TEST_DATE}` });
		expect(result.status).toBe(200);
		expect((result.body as { id: number }[]).map((task) => task.id)).toEqual([mine.id]);
	});
});

describe('GET /edit?from=', () => {
	test('returns every task of the user from that day on, oldest first', async () => {
		const user = await makeUser();
		await makeTask({ date: '2026-10-13' });
		const later = await makeTask({ date: '2026-10-16', title: 'later' });
		const first = await makeTask({ date: TEST_DATE });
		await makeTask({ date: TEST_DATE, email: 'other@example.com' });
		const result = await callRoute(GET, { user, url: `/edit?from=${TEST_DATE}` });
		expect((result.body as { id: number }[]).map((task) => task.id)).toEqual([first.id, later.id]);
	});

	test('a start that is not a date gives 400', async () => {
		const user = await makeUser();
		expect((await callRoute(GET, { user, url: '/edit?from=soon' })).status).toBe(400);
	});
});

describe('POST /edit', () => {
	test('needs a login', async () => {
		expect((await callRoute(POST, { body: valid })).status).toBe(401);
		expect(allTasks()).toEqual([]);
	});

	test('a valid task is saved for the user and answers 200 with the row', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: valid });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ ...valid, email: TEST_EMAIL, status: 'pending' });
		expect(allTasks()).toHaveLength(1);
	});

	test('the owner comes from the login, never from the body', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: { ...valid, email: 'other@example.com' } });
		expect(allTasks()[0].email).toBe(TEST_EMAIL);
	});

	test('logs task.created with origin user', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: valid });
		expect(allEvents()).toMatchObject([
			{ type: 'task.created', origin: 'user', email: TEST_EMAIL }
		]);
	});

	test.each([
		['no title (D2)', { title: undefined }],
		['an empty title', { title: '  ' }],
		['a title over 200 characters', { title: 'x'.repeat(201) }],
		['a date that is not a date', { date: '14.10.2026' }],
		['a start that is text', { startTime: '09:00' }],
		['a start after midnight', { startTime: 1440 }],
		['a negative start', { startTime: -5 }],
		['a fractional duration', { duration: 7.5 }],
		['a duration under five minutes', { duration: 2 }],
		['a priority above five (D1)', { priority: 9 }],
		['a priority of zero', { priority: 0 }],
		['a task that crosses midnight (D1)', { startTime: 1400, duration: 120 }],
		['a status that is not pending or completed', { status: 'active' }]
	])('rejects %s with 400 and saves nothing', async (_name, change) => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: { ...valid, ...change } });
		expect(result.status).toBe(400);
		expect(allTasks()).toEqual([]);
		expect(allEvents()).toEqual([]);
	});
});

describe('PUT /edit', () => {
	test('needs a login', async () => {
		const task = await makeTask();
		expect((await callRoute(PUT, { body: { id: task.id, title: 'x' } })).status).toBe(401);
	});

	test('changes the given fields and logs task.updated with origin user', async () => {
		const user = await makeUser();
		const task = await makeTask();
		const result = await callRoute(PUT, { user, body: { id: task.id, startTime: 10 * 60 } });
		expect(result.status).toBe(200);
		expect(allTasks()[0]).toMatchObject({ title: task.title, startTime: 600, duration: 60 });
		expect(allEvents()).toMatchObject([{ type: 'task.updated', origin: 'user' }]);
	});

	test('a full task as the client sends it works too', async () => {
		const user = await makeUser();
		const task = await makeTask();
		const result = await callRoute(PUT, { user, body: { ...task, status: 'completed' } });
		expect(result.status).toBe(200);
		expect(allTasks()[0].status).toBe(TaskStatus.Completed);
		expect(allEvents()).toMatchObject([{ type: 'task.completed', origin: 'user' }]);
	});

	test.each([
		['an empty title', { title: '' }],
		['a title that is not text', { title: 5 }],
		['a priority above five', { priority: 9 }],
		['a duration that is text', { duration: '30' }],
		['a start after midnight', { startTime: 1500 }],
		['a status that is not pending or completed', { status: 'overdue' }],
		['a date that is not a date', { date: 'soon' }],
		['a change that makes the task cross midnight', { startTime: 1400, duration: 120 }]
	])('rejects %s with 400 and leaves the task alone', async (_name, change) => {
		const user = await makeUser();
		const task = await makeTask();
		const result = await callRoute(PUT, { user, body: { id: task.id, ...change } });
		expect(result.status).toBe(400);
		expect(allTasks()).toEqual([task]);
		expect(allEvents()).toEqual([]);
	});

	test('a start that only crosses midnight together with the saved duration is rejected', async () => {
		const user = await makeUser();
		const task = await makeTask({ duration: 120 });
		const result = await callRoute(PUT, { user, body: { id: task.id, startTime: 1400 } });
		expect(result.status).toBe(400);
		expect(allTasks()).toEqual([task]);
	});

	test.each([
		['an unknown id', 999],
		['a task of someone else', 'foreign']
	])('%s gives 404 (D3)', async (_name, which) => {
		const user = await makeUser();
		const other = await makeTask({ email: 'other@example.com' });
		const id = which === 'foreign' ? other.id : (which as number);
		const result = await callRoute(PUT, { user, body: { id, title: 'x' } });
		expect(result.status).toBe(404);
		expect(allTasks()).toEqual([other]);
	});

	test('a non numeric id gives 400 (D3)', async () => {
		const user = await makeUser();
		expect((await callRoute(PUT, { user, body: { id: 'abc', title: 'x' } })).status).toBe(400);
	});
});

describe('DELETE /edit', () => {
	test('needs a login', async () => {
		const task = await makeTask();
		expect((await callRoute(DELETE, { body: { id: task.id } })).status).toBe(401);
		expect(allTasks()).toHaveLength(1);
	});

	test('removes the task and logs task.deleted with origin user', async () => {
		const user = await makeUser();
		const task = await makeTask();
		const result = await callRoute(DELETE, { user, body: { id: task.id } });
		expect(result.status).toBe(200);
		expect(db.select().from(tasks).where(eq(tasks.id, task.id)).all()).toEqual([]);
		expect(allEvents()).toMatchObject([{ type: 'task.deleted', origin: 'user' }]);
	});

	test.each([
		['an unknown id', 999],
		['a task of someone else', 'foreign']
	])('%s gives 404 and deletes nothing (D3)', async (_name, which) => {
		const user = await makeUser();
		const other = await makeTask({ email: 'other@example.com' });
		const id = which === 'foreign' ? other.id : (which as number);
		expect((await callRoute(DELETE, { user, body: { id } })).status).toBe(404);
		expect(allTasks()).toEqual([other]);
	});

	test('a non numeric id gives 400 (D3)', async () => {
		const user = await makeUser();
		expect((await callRoute(DELETE, { user, body: { id: 'abc' } })).status).toBe(400);
	});
});
