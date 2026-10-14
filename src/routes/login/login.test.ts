/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { POST } from './+server.js';
import { resetDb } from '#test/db.js';
import { callRoute, makeUser, type FakeCookies, requestEvent } from '#test/fixtures.js';

beforeEach(resetDb);

const form = (...services: string[]) => {
	const data = new FormData();
	for (const service of services) data.append('services', service);
	return data;
};

const post = (init: Parameters<typeof requestEvent>[0]) => {
	const event = requestEvent({ method: 'POST', url: '/login', ...init });
	return { event, result: callRoute(POST, event) };
};

const cookieNames = (cookies: FakeCookies) =>
	cookies.calls.filter((call) => call.op === 'set').map((call) => call.name);

describe('POST /login', () => {
	test('works for a visitor and redirects to Google with state and verifier cookies', async () => {
		const { event, result } = post({ body: form() });
		const response = await result;
		expect(response.status).toBe(303);
		const target = new URL(response.headers.get('location') ?? '');
		expect(target.origin).toBe('https://accounts.google.com');
		expect(target.searchParams.get('scope')).toBe('email');
		expect(cookieNames(event.cookies)).toEqual(['google_oauth_state', 'google_code_verifier']);
	});

	test('asks for the ticked services on top of the sign-in for a signed in user', async () => {
		const user = await makeUser();
		const { event, result } = post({ user, body: form('calendar', 'tasks') });
		const target = new URL((await result).headers.get('location') ?? '');
		const scope = target.searchParams.get('scope') ?? '';
		expect(scope).toContain('calendar.events');
		expect(scope).toContain('auth/tasks');
		expect(cookieNames(event.cookies)).toContain('google_oauth_link');
	});

	test('refuses services without a sign in', async () => {
		expect((await post({ body: form('calendar') }).result).status).toBe(401);
	});

	test('refuses services Google does not offer', async () => {
		const user = await makeUser();
		expect((await post({ user, body: form('mail') }).result).status).toBe(400);
	});
});
