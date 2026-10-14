/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { POST } from './+server.js';
import { callRoute, requestEvent } from '#test/fixtures.js';
import { fakeFetch } from '#test/fakes.js';

const REVOKE = 'POST https://oauth2.googleapis.com/revoke';

describe('POST /logout', () => {
	test('clears both cookies, revokes the token and goes to Now', async () => {
		const { requests } = fakeFetch({ [REVOKE]: () => new Response('{}') });
		const event = requestEvent({
			method: 'POST',
			url: '/logout',
			cookies: { session: 's', token: 't' }
		});
		const response = await callRoute(POST, event);
		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/');
		expect(event.cookies.calls.filter((c) => c.op === 'delete').map((c) => c.name)).toEqual([
			'session',
			'token'
		]);
		expect(requests).toHaveLength(1);
	});

	test('signs out even when Google cannot be reached', async () => {
		fakeFetch({
			[REVOKE]: () => {
				throw new TypeError('fetch failed');
			}
		});
		const event = requestEvent({ method: 'POST', url: '/logout', cookies: { token: 't' } });
		expect((await callRoute(POST, event)).status).toBe(303);
		expect(event.cookies.jar.has('token')).toBe(false);
	});

	test('a visitor without cookies is sent to Now without calling Google', async () => {
		const { requests } = fakeFetch({});
		expect((await callRoute(POST, { method: 'POST', url: '/logout' })).status).toBe(303);
		expect(requests).toEqual([]);
	});
});
