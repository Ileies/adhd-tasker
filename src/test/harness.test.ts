/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { building, dev } from '$app/env';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { tasker } from '#lib/app.svelte.js';
import { db } from '#lib/server/db/index.js';
import { reminders, tasks } from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
import {
	TEST_DATE,
	TEST_EMAIL,
	callRoute,
	makeTask,
	makeUser,
	requestEvent
} from '#test/fixtures.js';
import { assertNoRefusedRequests } from '#test/network.js';

beforeEach(resetDb);

describe('preload', () => {
	test('$app/env is faked for tests: building, not dev', () => {
		expect(building).toBe(true);
		expect(dev).toBe(false);
		expect(GOOGLE_CLIENT_SECRET).toBe('test-secret');
	});

	test('runes in app.svelte.ts are compiled, so tasker is plain reactive state', () => {
		tasker.isMuted = true;
		expect(tasker.isMuted).toBe(true);
		tasker.isMuted = false;
	});

	test('fetch refuses the network and the refusal is reported even when swallowed', async () => {
		await fetch('https://example.com/').catch(() => {});
		expect(() => assertNoRefusedRequests()).toThrow('GET https://example.com/');
	});
});

describe('fakeFetch', () => {
	test('answers known routes and records the requests', async () => {
		const { requests } = fakeFetch({
			'POST https://example.com/a': () => Response.json({ ok: true }),
			'https://example.com/b': () => new Response('b')
		});
		expect(await (await fetch('https://example.com/a', { method: 'POST' })).json()).toEqual({
			ok: true
		});
		expect(await (await fetch('https://example.com/b?x=1')).text()).toBe('b');
		expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
			'POST https://example.com/a',
			'GET https://example.com/b?x=1'
		]);
	});

	test('refuses an unknown route', async () => {
		fakeFetch({});
		const failure = await fetch('https://example.com/c').catch((e: Error) => e.message);
		expect(failure).toBe('network access in a test: GET https://example.com/c');
		expect(() => assertNoRefusedRequests()).toThrow('GET https://example.com/c');
	});
});

describe('resetDb', () => {
	test('starts every test with empty tables and ids from 1', async () => {
		const first = await makeTask();
		await db.insert(reminders).values({ taskId: first.id, reminderTime: 5 });
		await resetDb();
		expect(await db.select().from(tasks)).toEqual([]);
		expect((await makeTask()).id).toBe(1);
	});
});

describe('callRoute', () => {
	test('turns a thrown error() into a result', async () => {
		const result = await callRoute(() => error(400, 'nope'));
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ message: 'nope' });
	});

	test('turns a thrown redirect() into a result with its location', async () => {
		const result = await callRoute(() => redirect(303, '/edit'));
		expect(result.status).toBe(303);
		expect(result.headers.get('location')).toBe('/edit');
	});

	test('passes the user, params, query and JSON body to the handler', async () => {
		const user = await makeUser();
		const result = await callRoute(
			async ({ locals, params, url, request }: RequestEvent) =>
				Response.json({
					email: locals.user?.email,
					id: params.id,
					date: url.searchParams.get('date'),
					body: await request.json()
				}),
			{ user, url: `/edit?date=${TEST_DATE}`, params: { id: '7' }, body: { title: 'Call' } }
		);
		expect(result).toMatchObject({
			status: 200,
			body: { email: TEST_EMAIL, id: '7', date: TEST_DATE, body: { title: 'Call' } }
		});
	});

	test('records cookies a handler sets', () => {
		const event = requestEvent({ cookies: { session: 'old' } });
		event.cookies.set('session', 'new', { path: '/' });
		expect(event.cookies.get('session')).toBe('new');
		expect(event.cookies.calls).toEqual([
			{ op: 'set', name: 'session', value: 'new', opts: { path: '/' } }
		]);
	});
});
