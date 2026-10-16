/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { DELETE, GET, POST, PUT } from './+server.js';
import { db } from '#lib/server/db/index.js';
import { events, routines, tasks, users } from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

// A Wednesday, noon in Berlin
const NOW = Date.parse('2026-10-14T10:00:00Z');
const lunch = { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily' };

beforeEach(async () => {
	await resetDb();
	setSystemTime(new Date(NOW));
});
afterEach(() => setSystemTime());

const allRoutines = () => db.select().from(routines).all();
const allTasks = () => db.select().from(tasks).all();

/** A routine of the given owner, who is created when missing. */
async function makeRoutine(email = TEST_EMAIL, title = 'Lunch') {
	await db.insert(users).values({ email, timezone: 'Europe/Berlin' }).onConflictDoNothing();
	const [row] = await db
		.insert(routines)
		.values({
			email,
			title,
			description: '',
			priority: 2,
			startTime: 720,
			duration: 45,
			shift: 0,
			kind: 'block',
			repeat: 'daily',
			firstDay: '2026-10-14'
		})
		.returning();
	return row;
}

describe('GET /routines', () => {
	test('needs a login', async () => {
		expect((await callRoute(GET)).status).toBe(401);
	});

	test('lists the routines of that user only', async () => {
		const user = await makeUser();
		const mine = await makeRoutine();
		await makeRoutine('other@example.com', 'not mine');
		const result = await callRoute(GET, { user });
		expect((result.body as { id: number }[]).map((routine) => routine.id)).toEqual([mine.id]);
	});
});

describe('POST /routines', () => {
	test('needs a login', async () => {
		expect((await callRoute(POST, { body: lunch })).status).toBe(401);
		expect(allRoutines()).toEqual([]);
	});

	test('a routine is saved for the user and makes its tasks for 14 days', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: lunch });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ title: 'Lunch', repeat: 'daily', through: '2026-10-27' });
		expect(allRoutines()).toMatchObject([{ email: TEST_EMAIL }]);
		expect(allTasks()).toHaveLength(14);
		expect(allTasks().every((task) => task.email === TEST_EMAIL)).toBe(true);
	});

	test('its tasks are plain writes, the agent has no event to react to', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: lunch });
		expect(db.select().from(events).all()).toEqual([]);
	});

	test('the owner comes from the login, never from the body', async () => {
		const user = await makeUser();
		await callRoute(POST, { user, body: { ...lunch, email: 'other@example.com' } });
		expect(allRoutines()[0].email).toBe(TEST_EMAIL);
	});

	test.each([
		['no title', { startTime: 720, duration: 45, repeat: 'daily' }],
		['no repeat', { title: 'x', startTime: 720, duration: 45 }],
		['a repeat of none', { ...lunch, repeat: 'none' }],
		['a task across midnight', { ...lunch, startTime: 1430 }]
	])('%s answers 400 and saves nothing', async (_name, body) => {
		const user = await makeUser();
		expect((await callRoute(POST, { user, body })).status).toBe(400);
		expect(allRoutines()).toEqual([]);
		expect(allTasks()).toEqual([]);
	});
});

describe('PUT /routines', () => {
	test('needs a login', async () => {
		const routine = await makeRoutine();
		expect((await callRoute(PUT, { body: { id: routine.id, title: 'x' } })).status).toBe(401);
	});

	test('a new time moves the tasks that follow and answers the stored routine', async () => {
		const user = await makeUser();
		const made = await callRoute(POST, { user, body: lunch });
		const { id } = made.body as { id: number };
		const result = await callRoute(PUT, { user, body: { id, startTime: 750 } });
		expect(result.body).toMatchObject({ id, startTime: 750 });
		expect(allTasks().every((task) => task.startTime === 750)).toBe(true);
	});

	test('another user cannot change it', async () => {
		const user = await makeUser();
		const theirs = await makeRoutine('other@example.com');
		expect((await callRoute(PUT, { user, body: { id: theirs.id, title: 'x' } })).status).toBe(404);
		expect(allRoutines()[0].title).toBe('Lunch');
	});

	test.each([
		['no id', { title: 'x' }, 400],
		['an unknown id', { id: 999, title: 'x' }, 404],
		['an invalid field', { id: 1, duration: -1 }, 400]
	])('%s answers %d', async (_name, body, status) => {
		const user = await makeUser();
		await makeRoutine();
		expect((await callRoute(PUT, { user, body })).status).toBe(status);
	});
});

describe('DELETE /routines', () => {
	test('needs a login', async () => {
		const routine = await makeRoutine();
		expect((await callRoute(DELETE, { body: { id: routine.id } })).status).toBe(401);
		expect(allRoutines()).toHaveLength(1);
	});

	test('removes the routine and its tasks, and answers it for an Undo', async () => {
		const user = await makeUser();
		const made = await callRoute(POST, { user, body: lunch });
		const { id } = made.body as { id: number };
		const result = await callRoute(DELETE, { user, body: { id } });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ id, title: 'Lunch' });
		expect(allRoutines()).toEqual([]);
		expect(allTasks()).toEqual([]);
	});

	test('another user cannot delete it', async () => {
		const user = await makeUser();
		const theirs = await makeRoutine('other@example.com');
		expect((await callRoute(DELETE, { user, body: { id: theirs.id } })).status).toBe(404);
		expect(allRoutines()).toHaveLength(1);
	});
});
