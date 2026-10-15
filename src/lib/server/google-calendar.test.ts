/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import {
	accessToken,
	API,
	GoogleAuthError,
	GoogleError,
	listCalendars,
	listEvents,
	TOKEN_URL
} from '#lib/server/google-calendar.js';
import { clearAccessTokens, storeRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeUser } from '#test/fixtures.js';

beforeEach(async () => {
	await resetDb();
	clearAccessTokens();
	await makeUser({ googleServices: 'calendar' });
	storeRefreshToken(TEST_EMAIL, 'refresh-1', ['email'], 1);
});

/** What a call threw, so the test can assert on it. */
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(error: unknown) => error
	);

const TOKEN = `POST ${TOKEN_URL}`;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('accessToken', () => {
	test('trades the refresh token for an access token and says what it sends', async () => {
		const { requests } = fakeFetch({
			[TOKEN]: () => json({ access_token: 'access-1', expires_in: 3600 })
		});
		expect(await accessToken(TEST_EMAIL, 1_000_000)).toBe('access-1');
		const sent = new URLSearchParams(await requests[0].text());
		expect(sent.get('grant_type')).toBe('refresh_token');
		expect(sent.get('refresh_token')).toBe('refresh-1');
		expect(sent.get('client_id')).toBeTruthy();
	});

	test('keeps the token until a minute before it expires, then asks again', async () => {
		let asked = 0;
		fakeFetch({
			[TOKEN]: () => json({ access_token: `access-${++asked}`, expires_in: 3600 })
		});
		const start = 2_000_000_000;
		expect(await accessToken(TEST_EMAIL, start)).toBe('access-1');
		expect(await accessToken(TEST_EMAIL, start + 3_000_000)).toBe('access-1');
		expect(await accessToken(TEST_EMAIL, start + 3_545_000)).toBe('access-2');
		expect(asked).toBe(2);
	});

	test('a grant Google no longer knows means linking has to be redone', async () => {
		fakeFetch({ [TOKEN]: () => json({ error: 'invalid_grant' }, 400) });
		expect(await failure(accessToken(TEST_EMAIL, 3_000_000_000))).toBeInstanceOf(GoogleAuthError);
	});

	test('without a stored token there is nothing to trade', async () => {
		fakeFetch({});
		expect(await failure(accessToken('nobody@example.com', 4_000_000_000))).toBeInstanceOf(
			GoogleAuthError
		);
	});

	test('another failure of Google is an error with its status, not a lost link', async () => {
		fakeFetch({ [TOKEN]: () => json({ error: 'backend_error' }, 503) });
		const error = await accessToken(TEST_EMAIL, 5_000_000_000).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(GoogleError);
		expect(error).toMatchObject({ status: 503 });
	});
});

describe('listCalendars', () => {
	test('lists the readable calendars, primary first, with the name the user gave them', async () => {
		const { requests } = fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () =>
				json({
					items: [
						{ id: 'work@group', summary: 'Work' },
						{
							id: 'me@example.com',
							summary: 'me@example.com',
							summaryOverride: 'Mine',
							primary: true
						},
						{ id: 'a@group', summary: 'Birthdays' }
					]
				})
		});
		expect(await listCalendars(TEST_EMAIL, 6_000_000_000)).toEqual([
			{ id: 'me@example.com', name: 'Mine', primary: true },
			{ id: 'a@group', name: 'Birthdays', primary: false },
			{ id: 'work@group', name: 'Work', primary: false }
		]);
		const listed = requests.find((request) => request.url.includes('calendarList'));
		expect(listed?.headers.get('Authorization')).toBe('Bearer a');
		expect(new URL(listed?.url ?? '').searchParams.get('minAccessRole')).toBe('reader');
	});

	test('follows the pages', async () => {
		let page = 0;
		fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () =>
				page++ === 0
					? json({ items: [{ id: 'a', summary: 'A' }], nextPageToken: 'more' })
					: json({ items: [{ id: 'b', summary: 'B' }] })
		});
		expect((await listCalendars(TEST_EMAIL, 7_000_000_000)).map((c) => c.id)).toEqual(['a', 'b']);
	});

	test('a refused access token means linking has to be redone', async () => {
		fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () => json({}, 401)
		});
		expect(await failure(listCalendars(TEST_EMAIL, 8_000_000_000))).toBeInstanceOf(GoogleAuthError);
	});

	test('another status is a Google error', async () => {
		fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () => json({}, 500)
		});
		expect(await failure(listCalendars(TEST_EMAIL, 9_000_000_000))).toMatchObject({ status: 500 });
	});
});

describe('listEvents', () => {
	test('asks for single instances inside the window and escapes the calendar id', async () => {
		const { requests } = fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/calendars/me%40example.com/events`]: () => json({ items: [{ id: 'e1' }] })
		});
		const window = { timeMin: '2026-10-14T00:00:00.000Z', timeMax: '2026-10-29T00:00:00.000Z' };
		expect(await listEvents(TEST_EMAIL, 10_000_000_000, 'me@example.com', window)).toEqual([
			{ id: 'e1' }
		]);
		const asked = new URL(requests.find((request) => request.url.includes('events'))?.url ?? '');
		expect(asked.searchParams.get('singleEvents')).toBe('true');
		expect(asked.searchParams.get('timeMin')).toBe(window.timeMin);
		expect(asked.searchParams.get('timeMax')).toBe(window.timeMax);
	});

	test('follows the pages and stops at the limit', async () => {
		let page = 0;
		fakeFetch({
			[TOKEN]: () => json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/calendars/busy/events`]: () => {
				page++;
				return json({
					items: Array.from({ length: 250 }, (_, i) => ({ id: `${page}-${i}` })),
					nextPageToken: 'more'
				});
			}
		});
		const window = { timeMin: 'a', timeMax: 'b' };
		const events = await listEvents(TEST_EMAIL, 11_000_000_000, 'busy', window);
		expect(events).toHaveLength(1000);
		expect(page).toBe(4);
	});
});
