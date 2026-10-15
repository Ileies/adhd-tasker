/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { GET } from './+server.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { hasRefreshToken, readRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser, requestEvent } from '#test/fixtures.js';

beforeEach(resetDb);

const CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
const cookies = { google_oauth_state: 's1', google_code_verifier: 'v1', google_oauth_link: '1' };

/** Google's side of linking: the token endpoint and the userinfo endpoint. */
function google(token: Record<string, unknown>, email = TEST_EMAIL) {
	return fakeFetch({
		'POST https://oauth2.googleapis.com/token': () =>
			Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, ...token }),
		'https://openidconnect.googleapis.com/v1/userinfo': () => Response.json({ email })
	});
}

const link = (user?: Awaited<ReturnType<typeof makeUser>>) =>
	callRoute(
		GET,
		requestEvent({ user, url: '/callback?code=c1&state=s1', cookies: { ...cookies } })
	);

const servicesOf = () => db.select().from(users).get()?.googleServices;

describe('GET /callback when linking Google services', () => {
	test('stores the refresh token and records what was granted', async () => {
		const user = await makeUser();
		google({ refresh_token: 'refresh-1', scope: `email ${CALENDAR}` });
		expect((await link(user)).status).toBe(302);
		expect(readRefreshToken(TEST_EMAIL)).toBe('refresh-1');
		expect(servicesOf()).toBe('calendar');
	});

	test('a grant without a refresh token keeps the one stored before', async () => {
		const user = await makeUser();
		google({ refresh_token: 'refresh-1', scope: `email ${CALENDAR}` });
		await link(user);
		google({ scope: `email ${CALENDAR}` });
		await link(user);
		expect(readRefreshToken(TEST_EMAIL)).toBe('refresh-1');
	});

	test('a token for another Google account is not stored', async () => {
		const user = await makeUser();
		google({ refresh_token: 'refresh-1', scope: `email ${CALENDAR}` }, 'other@example.com');
		const result = await link(user);
		expect(result.headers.get('location')).toBe('/error?error=invalid_request');
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
		expect(servicesOf()).toBe('');
	});

	test('declining the permissions changes nothing', async () => {
		const user = await makeUser();
		const result = await callRoute(
			GET,
			requestEvent({ user, url: '/callback?error=access_denied', cookies: { ...cookies } })
		);
		expect(result.headers.get('location')).toBe('/settings');
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
	});

	test('a state that does not match is refused', async () => {
		const user = await makeUser();
		const result = await callRoute(
			GET,
			requestEvent({ user, url: '/callback?code=c1&state=other', cookies: { ...cookies } })
		);
		expect(result.headers.get('location')).toBe('/error?error=invalid_request');
	});
});
