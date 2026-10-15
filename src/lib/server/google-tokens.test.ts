/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { googleTokens, users } from '#lib/server/db/schema.js';
import {
	hasRefreshToken,
	readRefreshToken,
	revokeGoogle,
	REVOKE_URL,
	storeRefreshToken
} from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const SCOPES = ['email', 'https://www.googleapis.com/auth/calendar.events'];
const REVOKE = `POST ${REVOKE_URL}`;

describe('storeRefreshToken', () => {
	test('keeps the token encrypted and gives it back as Google sent it', async () => {
		await makeUser();
		storeRefreshToken(TEST_EMAIL, '1//refresh-me', SCOPES, 1000);
		const row = db.select().from(googleTokens).get();
		expect(row?.refreshToken).not.toContain('refresh-me');
		expect(row?.scopes).toBe(SCOPES.join(' '));
		expect(readRefreshToken(TEST_EMAIL)).toBe('1//refresh-me');
	});

	test('a new consent replaces the old token, one row per user', async () => {
		await makeUser();
		storeRefreshToken(TEST_EMAIL, 'old', SCOPES, 1000);
		storeRefreshToken(TEST_EMAIL, 'new', SCOPES, 2000);
		expect(db.select().from(googleTokens).all()).toHaveLength(1);
		expect(readRefreshToken(TEST_EMAIL)).toBe('new');
	});

	test('a user without a token has none', async () => {
		await makeUser();
		expect(readRefreshToken(TEST_EMAIL)).toBeUndefined();
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
	});
});

describe('revokeGoogle', () => {
	test('tells Google, then forgets the token and the linked services', async () => {
		await makeUser({ googleServices: 'calendar' });
		storeRefreshToken(TEST_EMAIL, 'tok', SCOPES, 1000);
		const { requests } = fakeFetch({ [REVOKE]: () => new Response('{}') });
		expect(await revokeGoogle(TEST_EMAIL)).toEqual({ revoked: true });
		expect(await requests[0].text()).toBe('token=tok');
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
		expect(db.select().from(users).where(eq(users.email, TEST_EMAIL)).get()?.googleServices).toBe(
			''
		);
	});

	test('forgets the token even when Google cannot be reached, and says it was not revoked', async () => {
		await makeUser();
		storeRefreshToken(TEST_EMAIL, 'tok', SCOPES, 1000);
		fakeFetch({
			[REVOKE]: () => {
				throw new TypeError('fetch failed');
			}
		});
		expect(await revokeGoogle(TEST_EMAIL)).toEqual({ revoked: false });
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
	});

	test('a token Google no longer knows counts as revoked', async () => {
		await makeUser();
		storeRefreshToken(TEST_EMAIL, 'tok', SCOPES, 1000);
		fakeFetch({ [REVOKE]: () => new Response('{}', { status: 400 }) });
		expect(await revokeGoogle(TEST_EMAIL)).toEqual({ revoked: true });
	});

	test('without a token there is nothing to tell Google', async () => {
		await makeUser({ googleServices: 'tasks' });
		const { requests } = fakeFetch({});
		expect(await revokeGoogle(TEST_EMAIL)).toEqual({ revoked: true });
		expect(requests).toHaveLength(0);
	});
});
