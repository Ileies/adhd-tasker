/// <reference types="bun" />
import { beforeEach, describe, expect, setSystemTime, afterEach, test } from 'bun:test';
import { DELETE, POST, PUT } from './+server.js';
import { READ_ONLY_REASON } from '#lib/core/calendar.js';
import { importCalendars, previewCalendars } from '#lib/server/calendar.js';
import { db } from '#lib/server/db/index.js';
import { calendarSync, tasks } from '#lib/server/db/schema.js';
import { API, TOKEN_URL } from '#lib/server/google-calendar.js';
import { clearAccessTokens, storeRefreshToken } from '#lib/server/google-tokens.js';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';
import { eq } from 'drizzle-orm';

const NOW = Date.parse('2026-10-14T08:00:00Z');
const EVENTS = `${API}/calendars/primary/events`;

let event: Record<string, unknown>;
let patched: Record<string, unknown>[];
let heard: StreamMessage[];
let stop: () => void;

beforeEach(async () => {
	await resetDb();
	clearAccessTokens();
	setSystemTime(new Date(NOW));
	event = {
		id: 'standup',
		etag: '"1"',
		summary: 'Standup',
		start: { dateTime: '2026-10-14T10:00:00Z' },
		end: { dateTime: '2026-10-14T10:30:00Z' }
	};
	patched = [];
	heard = [];
	stop = subscribe(TEST_EMAIL, 'tab', (message) => void heard.push(message));
	fakeFetch({
		[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
		[`GET ${EVENTS}`]: () => Response.json({ items: [event] }),
		[`GET ${EVENTS}/standup`]: () => Response.json(event),
		[`PATCH ${EVENTS}/standup`]: async (request) => {
			patched.push((await request.json()) as Record<string, unknown>);
			return Response.json({ id: 'standup', etag: '"2"' });
		},
		[`POST ${EVENTS}`]: () => Response.json({ id: 'made', etag: '"m"' })
	});
});
afterEach(() => {
	stop();
	setSystemTime();
});

async function followed() {
	const user = await makeUser({ googleServices: 'calendar', timezone: 'UTC' });
	storeRefreshToken(TEST_EMAIL, 'refresh', ['email'], 1);
	await previewCalendars(TEST_EMAIL, ['primary'], NOW);
	await importCalendars(TEST_EMAIL, 'all', NOW);
	return { user, task: db.select().from(tasks).get()! };
}

describe('PUT /edit with Calendar followed', () => {
	test('moving an imported task patches its event', async () => {
		const { user, task } = await followed();
		const result = await callRoute(PUT, {
			user,
			method: 'PUT',
			body: { ...task, startTime: 660 }
		});
		expect(result.status).toBe(200);
		expect(patched).toHaveLength(1);
		expect(heard).toEqual([]);
	});

	test('when Google changed the event meanwhile, the screens are told and the plan is Google', async () => {
		const { user, task } = await followed();
		event = {
			...event,
			etag: '"9"',
			start: { dateTime: '2026-10-14T14:00:00Z' },
			end: { dateTime: '2026-10-14T14:30:00Z' }
		};
		expect(
			(await callRoute(PUT, { user, method: 'PUT', body: { ...task, startTime: 660 } })).status
		).toBe(200);
		expect(heard).toEqual([{ type: 'calendar', message: expect.stringContaining('"Standup"') }]);
		expect(db.select().from(tasks).get()?.startTime).toBe(840);
	});

	test('an event that runs past midnight cannot be moved here, but can be marked done', async () => {
		event = {
			...event,
			start: { dateTime: '2026-10-14T23:00:00Z' },
			end: { dateTime: '2026-10-15T01:00:00Z' }
		};
		const { user, task } = await followed();
		const moved = await callRoute(PUT, { user, method: 'PUT', body: { ...task, startTime: 0 } });
		expect(moved).toMatchObject({ status: 409, body: { message: READ_ONLY_REASON } });
		const done = await callRoute(PUT, {
			user,
			method: 'PUT',
			body: { ...task, status: 'completed' }
		});
		expect(done.status).toBe(200);
		expect(patched).toEqual([]);
	});

	test('without Calendar nothing goes to Google', async () => {
		const user = await makeUser();
		const made = await callRoute(POST, {
			user,
			body: {
				title: 'A',
				description: '',
				date: '2026-10-14',
				startTime: 540,
				duration: 30,
				priority: 3
			}
		});
		expect(made.status).toBe(200);
		expect(patched).toEqual([]);
	});
});

describe('POST and DELETE /edit with the setting on', () => {
	test('a new task gets an event and deleting it removes the event', async () => {
		const { user } = await followed();
		db.update(calendarSync)
			.set({ writeCalendar: 'primary' })
			.where(eq(calendarSync.email, TEST_EMAIL))
			.run();
		const deletes: string[] = [];
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
			[`POST ${EVENTS}`]: () => Response.json({ id: 'made', etag: '"m"' }),
			[`DELETE ${EVENTS}/made`]: () => {
				deletes.push('made');
				return new Response(null, { status: 204 });
			}
		});
		const made = await callRoute(POST, {
			user,
			body: {
				title: 'Mine',
				description: '',
				date: '2026-10-15',
				startTime: 540,
				duration: 30,
				priority: 3
			}
		});
		const { id } = made.body as { id: number };
		await callRoute(DELETE, { user, method: 'DELETE', body: { id } });
		expect(deletes).toEqual(['made']);
	});
});
