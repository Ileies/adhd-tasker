/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';
import { createSession, readSession, verifyIdToken } from '#lib/server/session.js';
import { fakeFetch } from '#test/fakes.js';

describe('createSession and readSession', () => {
	test('round trip with the server secret', () => {
		expect(readSession(createSession('me@test'))).toBe('me@test');
	});

	test('a missing cookie means no session', () => {
		expect(readSession(undefined)).toBeUndefined();
	});
});

describe('verifyIdToken', () => {
	const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
	const answer = (body: Record<string, unknown>, status = 200) =>
		fakeFetch({ [TOKENINFO]: () => Response.json(body, { status }) });

	test('returns the email of a token issued for this app', async () => {
		answer({ aud: PUBLIC_GOOGLE_CLIENT_ID, email: 'me@test', email_verified: 'true' });
		expect(await verifyIdToken('token')).toBe('me@test');
	});

	test('sends the token to Google, encoded', async () => {
		const { requests } = answer({
			aud: PUBLIC_GOOGLE_CLIENT_ID,
			email: 'me@test',
			email_verified: true
		});
		await verifyIdToken('a b&c');
		expect(new URL(requests[0]!.url).searchParams.get('id_token')).toBe('a b&c');
	});

	test('a token for another app is refused', async () => {
		answer({ aud: 'someone-else', email: 'me@test', email_verified: 'true' });
		expect(await verifyIdToken('token')).toBeUndefined();
	});

	test('an unverified email is refused', async () => {
		answer({ aud: PUBLIC_GOOGLE_CLIENT_ID, email: 'me@test', email_verified: 'false' });
		expect(await verifyIdToken('token')).toBeUndefined();
	});

	test('an answer without an email is refused', async () => {
		answer({ aud: PUBLIC_GOOGLE_CLIENT_ID, email_verified: 'true' });
		expect(await verifyIdToken('token')).toBeUndefined();
	});

	test('a rejection from Google is refused', async () => {
		answer({ error: 'invalid_token' }, 400);
		expect(await verifyIdToken('token')).toBeUndefined();
	});
});
