/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { actions } from './+page.server.js';
import { hasRefreshToken, REVOKE_URL, storeRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeUser, requestEvent } from '#test/fixtures.js';

beforeEach(resetDb);

const unlink = (user?: Awaited<ReturnType<typeof makeUser>>) =>
	actions.unlinkGoogle(requestEvent({ user, method: 'POST' }) as never);

describe('unlinkGoogle', () => {
	test('needs a login', async () => {
		expect(await unlink()).toMatchObject({ status: 401 });
	});

	test('revokes the grant at Google and forgets the token', async () => {
		const user = await makeUser({ googleServices: 'calendar' });
		storeRefreshToken(TEST_EMAIL, 'tok', ['email'], 1);
		const { requests } = fakeFetch({
			[`POST ${REVOKE_URL}`]: () => new Response('{}')
		});
		expect(await unlink(user)).toEqual({ unlinked: true, revoked: true });
		expect(requests).toHaveLength(1);
		expect(hasRefreshToken(TEST_EMAIL)).toBe(false);
	});
});
