/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test';
import { DELETE, GET } from './+server.js';
import { GET as allDay } from './all-day/+server.js';
import { POST as importEvents } from './import/+server.js';
import { POST as preview } from './preview/+server.js';
import { POST as sync } from './sync/+server.js';
import { db } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema.js';
import { API, TOKEN_URL } from '#lib/server/google-calendar.js';
import { clearAccessTokens, storeRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(async () => {
	await resetDb();
	clearAccessTokens();
	setSystemTime(new Date('2026-10-14T08:00:00Z'));
});
afterEach(() => setSystemTime());

const standup = {
	id: 'standup',
	etag: '"1"',
	summary: 'Standup',
	start: { dateTime: '2026-10-14T10:00:00Z' },
	end: { dateTime: '2026-10-14T10:30:00Z' }
};
const holiday = {
	id: 'holiday',
	etag: '"1"',
	summary: 'Holiday',
	start: { date: '2026-10-20' },
	end: { date: '2026-10-21' }
};

/** A user who linked Calendar, with Google answering for one calendar. */
async function linked() {
	const user = await makeUser({ googleServices: 'calendar', timezone: 'UTC' });
	storeRefreshToken(TEST_EMAIL, 'refresh', ['email'], 1);
	fakeFetch({
		[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
		[`${API}/users/me/calendarList`]: () =>
			Response.json({ items: [{ id: 'primary', summary: 'Mine', primary: true }] }),
		[`${API}/calendars/primary/events`]: () => Response.json({ items: [standup, holiday] })
	});
	return user;
}

describe('every calendar route', () => {
	test.each([
		['GET /calendar', () => callRoute(GET)],
		['DELETE /calendar', () => callRoute(DELETE)],
		['preview', () => callRoute(preview, { body: { calendars: ['primary'] } })],
		['import', () => callRoute(importEvents, { body: { mode: 'all' } })],
		['sync', () => callRoute(sync, { method: 'POST' })],
		['all-day', () => callRoute(allDay, { url: '/calendar/all-day?from=2026-10-14&to=2026-10-28' })]
	])('%s needs a login', async (_name, call) => {
		expect((await call()).status).toBe(401);
	});

	test.each([
		[
			'preview',
			(user: Awaited<ReturnType<typeof makeUser>>) =>
				callRoute(preview, { user, body: { calendars: ['primary'] } })
		],
		[
			'import',
			(user: Awaited<ReturnType<typeof makeUser>>) =>
				callRoute(importEvents, { user, body: { mode: 'all' } })
		],
		[
			'sync',
			(user: Awaited<ReturnType<typeof makeUser>>) => callRoute(sync, { user, method: 'POST' })
		]
	])('%s asks to link Calendar first when it is not linked', async (_name, call) => {
		expect((await call(await makeUser())).status).toBe(409);
	});
});

describe('GET /calendar', () => {
	test('without a link says so and offers no calendars', async () => {
		const user = await makeUser();
		expect(await callRoute(GET, { user })).toMatchObject({
			status: 200,
			body: { linked: false, calendars: [], state: { status: 'none' } }
		});
	});

	test('lists the calendars to choose from', async () => {
		const user = await linked();
		expect((await callRoute(GET, { user })).body).toMatchObject({
			linked: true,
			calendars: [{ id: 'primary', name: 'Mine', primary: true }]
		});
	});

	test('says so when Google does not answer, instead of an empty list', async () => {
		const user = await linked();
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () => Response.json({}, { status: 500 })
		});
		const log = spyOn(console, 'error').mockImplementation(() => {});
		const result = await callRoute(GET, { user });
		log.mockRestore();
		expect(result.status).toBe(502);
	});
});

describe('the way from a preview to the plan', () => {
	test('preview changes nothing, import writes, sync follows, stop ends it', async () => {
		const user = await linked();

		const looked = await callRoute(preview, { user, body: { calendars: ['primary'] } });
		expect(looked).toMatchObject({
			status: 200,
			body: { events: 2, timed: 1, allDay: 1, clashing: 0 }
		});
		expect(db.select().from(tasks).all()).toEqual([]);

		const imported = await callRoute(importEvents, { user, body: { mode: 'all' } });
		expect(imported).toMatchObject({ status: 200, body: { tasks: 1, left: 0, allDay: 1 } });
		expect(db.select().from(tasks).all()).toHaveLength(1);

		expect((await callRoute(sync, { user, method: 'POST' })).body).toEqual({ changed: false });
		expect((await callRoute(GET, { user })).body).toMatchObject({ state: { status: 'active' } });
		expect(
			(await callRoute(allDay, { user, url: '/calendar/all-day?from=2026-10-14&to=2026-10-28' }))
				.body
		).toEqual([{ date: '2026-10-20', title: 'Holiday' }]);

		expect((await callRoute(DELETE, { user })).status).toBe(204);
		expect(db.select().from(tasks).all()).toHaveLength(1);
		expect((await callRoute(GET, { user })).body).toMatchObject({ state: { status: 'none' } });
	});

	test('import without a preview is refused', async () => {
		const user = await linked();
		expect((await callRoute(importEvents, { user, body: { mode: 'all' } })).status).toBe(409);
		expect(db.select().from(tasks).all()).toEqual([]);
	});

	test('a second preview while the calendars are followed is refused', async () => {
		const user = await linked();
		await callRoute(preview, { user, body: { calendars: ['primary'] } });
		await callRoute(importEvents, { user, body: { mode: 'all' } });
		expect((await callRoute(preview, { user, body: { calendars: ['primary'] } })).status).toBe(409);
	});

	test('a grant Google dropped answers 409 and ends the link', async () => {
		const user = await linked();
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ error: 'invalid_grant' }, { status: 400 })
		});
		setSystemTime(new Date('2030-01-01T08:00:00Z'));
		expect((await callRoute(preview, { user, body: { calendars: ['primary'] } })).status).toBe(409);
		expect((await callRoute(GET, { user })).body).toMatchObject({ linked: false });
	});
});

describe('request checks', () => {
	test.each([
		['no calendars', { calendars: [] }],
		['calendars that are not a list', { calendars: 'primary' }],
		['a calendar that is no text', { calendars: [1] }],
		['an empty id', { calendars: [''] }],
		['more than 20', { calendars: Array.from({ length: 21 }, (_, i) => `c${i}`) }],
		['nothing at all', {}]
	])('preview refuses %s', async (_name, body) => {
		const user = await linked();
		expect((await callRoute(preview, { user, body })).status).toBe(400);
	});

	test.each([
		['a mode that does not exist', { mode: 'merge' }],
		['no mode', {}]
	])('import refuses %s', async (_name, body) => {
		const user = await linked();
		expect((await callRoute(importEvents, { user, body })).status).toBe(400);
	});

	test('all-day refuses days that are not dates', async () => {
		const user = await linked();
		expect(
			(await callRoute(allDay, { user, url: '/calendar/all-day?from=today&to=2026-10-28' })).status
		).toBe(400);
		expect((await callRoute(allDay, { user, url: '/calendar/all-day' })).status).toBe(400);
	});
});
