/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { DELETE, GET, POST, PUT } from './+server.js';
import { db } from '#lib/server/db/index.js';
import { events, todos, users } from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const allTodos = () => db.select().from(todos).all();
const allEvents = () => db.select().from(events).all();

/** A to-do of the given owner, who is created when missing. */
async function makeTodo(email = TEST_EMAIL, title = 'Taxes') {
	await db.insert(users).values({ email, timezone: 'Europe/Berlin' }).onConflictDoNothing();
	const [row] = await db.insert(todos).values({ email, title, createdAt: Date.now() }).returning();
	return row;
}

describe('GET /todos', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('lists the to-dos of that user only', async () => {
		const user = await makeUser();
		const mine = await makeTodo();
		await makeTodo('other@example.com', 'not mine');
		const result = await callRoute(GET, { user });
		expect((result.body as { id: number }[]).map((todo) => todo.id)).toEqual([mine.id]);
	});
});

describe('POST /todos', () => {
	test('needs a login', async () => {
		expect((await callRoute(POST, { body: { title: 'x' } })).status).toBe(401);
		expect(allTodos()).toEqual([]);
	});

	test('a to-do is saved for the user and logged as todo.created', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: { title: 'Taxes', estimate: 90 } });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ title: 'Taxes', estimate: 90, status: 'open' });
		expect(allTodos()).toMatchObject([{ email: TEST_EMAIL, title: 'Taxes' }]);
		expect(allEvents()).toMatchObject([{ type: 'todo.created', origin: 'user' }]);
	});

	test('the owner comes from the login, never from the body', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: { title: 'x', email: 'other@example.com' } });
		expect(allTodos()[0].email).toBe(TEST_EMAIL);
	});

	test.each([
		['no title', {}],
		['an estimate of zero', { title: 'x', estimate: 0 }],
		['a time without a date', { title: 'x', dueTime: 600 }],
		['an appointment that does not exist', { title: 'x', parentId: 999 }]
	])('%s answers 400 and saves nothing', async (_name, body) => {
		const user = await makeUser();
		expect((await callRoute(POST, { user, body })).status).toBe(400);
		expect(allTodos()).toEqual([]);
	});

	test('an appointment of the user can be prepared for', async () => {
		const user = await makeUser();
		const task = await makeTask();
		const result = await callRoute(POST, { user, body: { title: 'Pack', parentId: task.id } });
		expect(result.body).toMatchObject({ parentId: task.id });
	});
});

describe('PUT /todos', () => {
	test('needs a login', async () => {
		const todo = await makeTodo();
		expect((await callRoute(PUT, { body: { id: todo.id, title: 'x' } })).status).toBe(401);
	});

	test('done fills the bar and answers the stored to-do', async () => {
		const user = await makeUser();
		const todo = await makeTodo();
		const result = await callRoute(PUT, { user, body: { id: todo.id, status: 'done' } });
		expect(result.body).toMatchObject({ status: 'done', progress: 100 });
		expect(allEvents()).toMatchObject([{ type: 'todo.completed' }]);
	});

	test('another user cannot change it', async () => {
		const user = await makeUser();
		const theirs = await makeTodo('other@example.com');
		expect((await callRoute(PUT, { user, body: { id: theirs.id, title: 'x' } })).status).toBe(404);
		expect(allTodos()[0].title).toBe('Taxes');
	});

	test.each([
		['no id', { title: 'x' }, 400],
		['an unknown id', { id: 999, title: 'x' }, 404],
		['an invalid field', { id: 1, estimate: -1 }, 400]
	])('%s answers %d', async (_name, body, status) => {
		const user = await makeUser();
		await makeTodo();
		expect((await callRoute(PUT, { user, body })).status).toBe(status);
	});
});

describe('DELETE /todos', () => {
	test('needs a login', async () => {
		const todo = await makeTodo();
		expect((await callRoute(DELETE, { body: { id: todo.id } })).status).toBe(401);
		expect(allTodos()).toHaveLength(1);
	});

	test('removes the to-do and logs todo.deleted', async () => {
		const user = await makeUser();
		const todo = await makeTodo();
		expect((await callRoute(DELETE, { user, body: { id: todo.id } })).status).toBe(200);
		expect(allTodos()).toEqual([]);
		expect(allEvents()).toMatchObject([{ type: 'todo.deleted' }]);
	});

	test('another user cannot delete it', async () => {
		const user = await makeUser();
		const theirs = await makeTodo('other@example.com');
		expect((await callRoute(DELETE, { user, body: { id: theirs.id } })).status).toBe(404);
		expect(allTodos()).toHaveLength(1);
	});
});
