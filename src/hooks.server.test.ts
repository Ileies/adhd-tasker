/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { SESSION_MAX_AGE, signSession } from '#lib/server/session-token.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
import { TEST_EMAIL, makeUser, requestEvent } from '#test/fixtures.js';
import { SHELL_GUEST, SHELL_HEADER } from '#lib/offline.js';

// The scheduler is not under test here and would pull in the whole agent
await mock.module('#lib/server/agent.js', () => ({ startAgent: () => {} }));
const { handle } = await import('./hooks.server.js');

const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const SECRET = 'test-secret';

afterEach(() => mock.restore());

beforeEach(async () => {
	await resetDb();
	spyOn(console, 'log').mockImplementation(() => {});
	spyOn(console, 'error').mockImplementation(() => {});
});

/** Runs the hook for a request with these cookies and returns what the page would see. */
async function visit(cookies: Record<string, string>) {
	const event = requestEvent({ cookies });
	await handle({ event, resolve: async () => new Response('') });
	return event;
}

const session = (email: string, ageMs = 0) => signSession(email, SECRET, Date.now() - ageMs);

describe('handle', () => {
	test('a valid session loads the user', async () => {
		await makeUser({ timezone: 'Asia/Tokyo' });
		const event = await visit({ session: session(TEST_EMAIL) });
		expect(event.locals.user?.email).toBe(TEST_EMAIL);
		expect(event.locals.user?.timezone).toBe('Asia/Tokyo');
	});

	test('the first login creates the user row', async () => {
		const event = await visit({ session: session('new@example.com') });
		expect(event.locals.user?.email).toBe('new@example.com');
		expect(db.select().from(users).where(eq(users.email, 'new@example.com')).all()).toHaveLength(1);
	});

	test('a second visit does not create a second row', async () => {
		await visit({ session: session(TEST_EMAIL) });
		await visit({ session: session(TEST_EMAIL) });
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	test('no cookies means no user and no row', async () => {
		const event = await visit({});
		expect(event.locals.user).toBeUndefined();
		expect(db.select().from(users).all()).toEqual([]);
	});

	test.each([
		['an expired session', session(TEST_EMAIL, SESSION_MAX_AGE * 1000 + 1000)],
		['a session signed with another secret', signSession(TEST_EMAIL, 'other', Date.now())],
		['a forged session', 'eyJlbWFpbCI6ImV2aWwifQ.AAAA']
	])('%s without a token means no user', async (_name, value) => {
		const event = await visit({ session: value });
		expect(event.locals.user).toBeUndefined();
		expect(db.select().from(users).all()).toEqual([]);
	});

	describe('token fallback', () => {
		test('a token Google accepts logs the user in', async () => {
			const { requests } = fakeFetch({
				[USERINFO]: () => Response.json({ email: TEST_EMAIL })
			});
			const event = await visit({ token: 'good' });
			expect(event.locals.user?.email).toBe(TEST_EMAIL);
			expect(requests[0].headers.get('authorization')).toBe('Bearer good');
		});

		test('a valid session needs no call to Google', async () => {
			const { requests } = fakeFetch({});
			await visit({ session: session(TEST_EMAIL), token: 'good' });
			expect(requests).toEqual([]);
		});

		test('a rejected token clears the cookie', async () => {
			fakeFetch({ [USERINFO]: () => Response.json({ error: 'invalid_token' }, { status: 401 }) });
			const event = await visit({ token: 'bad' });
			expect(event.locals.user).toBeUndefined();
			expect(event.cookies.jar.get('token')).toBe('');
			expect(event.cookies.calls).toContainEqual({
				op: 'set',
				name: 'token',
				value: '',
				opts: { path: '/', maxAge: -1 }
			});
		});

		test('a network error from Google means no user, not a failed request', async () => {
			fakeFetch({
				[USERINFO]: () => {
					throw new TypeError('fetch failed');
				}
			});
			const event = await visit({ token: 'good' });
			expect(event.locals.user).toBeUndefined();
		});

		test('a network error keeps the token, so the next request can try again', async () => {
			fakeFetch({
				[USERINFO]: () => {
					throw new TypeError('fetch failed');
				}
			});
			const event = await visit({ token: 'good' });
			expect(event.cookies.jar.get('token')).toBe('good');
		});
	});
});

describe('handle offline shell header', () => {
	async function header(cookies: Record<string, string>) {
		const response = await handle({
			event: requestEvent({ cookies }),
			resolve: async () => new Response('')
		});
		return response.headers.get(SHELL_HEADER);
	}

	test('a page for a guest is marked as safe to keep offline', async () => {
		expect(await header({})).toBe(SHELL_GUEST);
	});

	test('a page for a signed in user is not marked', async () => {
		await makeUser();
		expect(await header({ session: session(TEST_EMAIL) })).toBeNull();
	});
});
