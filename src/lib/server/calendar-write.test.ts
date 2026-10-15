/// <reference types="bun" />
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { DONE_MARK, type CalendarEvent } from '#lib/core/calendar.js';
import {
	importCalendars,
	previewCalendars,
	calendarState,
	chooseWriteCalendar
} from '#lib/server/calendar.js';
import { isReadOnly, writeTaskChange, type Written } from '#lib/server/calendar-write.js';
import { db } from '#lib/server/db/index.js';
import { calendarEvents, calendarSync, tasks } from '#lib/server/db/schema.js';
import { API, TOKEN_URL } from '#lib/server/google-calendar.js';
import { clearAccessTokens, storeRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeUser } from '#test/fixtures.js';
import { TaskStatus } from '#lib/types.js';

/** Eight in the morning on the day the plan starts, UTC is the timezone of the user. */
const NOW = Date.parse('2026-10-14T08:00:00Z');
const EVENTS = `${API}/calendars/primary/events`;

const standup: CalendarEvent = {
	id: 'standup',
	etag: '"1"',
	summary: 'Standup',
	description: 'Agenda',
	start: { dateTime: '2026-10-14T10:00:00Z' },
	end: { dateTime: '2026-10-14T10:30:00Z' }
};

/** What Google has now. Tests change it to play someone editing in Google. */
let google: Record<string, CalendarEvent>;
/** The changes the app sent. */
let patches: { id: string; ifMatch: string | null; body: Record<string, unknown> }[];
let created: Record<string, unknown>[];
let deleted: string[];
let patchStatus = 200;

beforeEach(async () => {
	await resetDb();
	clearAccessTokens();
	await makeUser({ googleServices: 'calendar', timezone: 'UTC' });
	storeRefreshToken(TEST_EMAIL, 'refresh', ['email'], 1);
	google = { standup: { ...standup } };
	patches = [];
	created = [];
	deleted = [];
	patchStatus = 200;
	fakeFetch({
		[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
		[`GET ${EVENTS}`]: () => Response.json({ items: Object.values(google) }),
		[`POST ${EVENTS}`]: async (request) => {
			const body = (await request.json()) as Record<string, unknown>;
			created.push(body);
			const id = `made-${created.length}`;
			google[id] = { id, etag: '"m1"', summary: String(body.summary) };
			return Response.json({ id, etag: '"m1"' });
		},
		[`GET ${EVENTS}/standup`]: () =>
			google.standup ? Response.json(google.standup) : new Response('{}', { status: 404 }),
		[`PATCH ${EVENTS}/standup`]: async (request) => {
			patches.push({
				id: 'standup',
				ifMatch: request.headers.get('If-Match'),
				body: (await request.json()) as Record<string, unknown>
			});
			return patchStatus === 200
				? Response.json({ id: 'standup', etag: '"2"' })
				: new Response('{}', { status: patchStatus });
		},
		[`GET ${EVENTS}/made-1`]: () =>
			google['made-1'] ? Response.json(google['made-1']) : new Response('{}', { status: 404 }),
		[`PATCH ${EVENTS}/made-1`]: async (request) => {
			patches.push({
				id: 'made-1',
				ifMatch: request.headers.get('If-Match'),
				body: (await request.json()) as Record<string, unknown>
			});
			return Response.json({ id: 'made-1', etag: '"m2"' });
		},
		[`DELETE ${EVENTS}/made-1`]: () => {
			deleted.push('made-1');
			delete google['made-1'];
			return new Response(null, { status: 204 });
		},
		[`DELETE ${EVENTS}/standup`]: () => {
			deleted.push('standup');
			return new Response(null, { status: 204 });
		}
	});
});

/** Calendar followed and the standup imported as the only task. */
async function followed() {
	await previewCalendars(TEST_EMAIL, ['primary'], NOW);
	await importCalendars(TEST_EMAIL, 'all', NOW);
	return task();
}

const task = (): Written => {
	const [row] = db.select().from(tasks).all();
	return row;
};
const turnWritingOn = () =>
	db
		.update(calendarSync)
		.set({ writeCalendar: 'primary' })
		.where(eq(calendarSync.email, TEST_EMAIL))
		.run();

/** An own task of the user, as the plan holds it. */
function ownTask(extra: Partial<Omit<Written, 'status'>> = {}): Written {
	const row = db
		.insert(tasks)
		.values({
			email: TEST_EMAIL,
			title: 'Write report',
			description: '',
			date: '2026-10-15',
			startTime: 540,
			duration: 60,
			priority: 3,
			...extra
		})
		.returning()
		.get();
	return row;
}

describe('an imported task', () => {
	test('moving it patches the time of its event, guarded by the etag it was read with', async () => {
		const before = await followed();
		const after = { ...before, startTime: 660 };
		expect(await writeTaskChange(TEST_EMAIL, before, after, NOW)).toBe('written');
		expect(patches).toHaveLength(1);
		expect(patches[0].ifMatch).toBe('"1"');
		expect(patches[0].body).toMatchObject({
			start: { dateTime: '2026-10-14T11:00:00.000Z', timeZone: 'UTC' },
			end: { dateTime: '2026-10-14T11:30:00.000Z' }
		});
		expect(patches[0].body).not.toHaveProperty('description');
		expect(db.select().from(calendarEvents).get()?.etag).toBe('"2"');
	});

	test('done adds the marker to the description Google has, undone takes it off again', async () => {
		const before = await followed();
		const done = { ...before, status: TaskStatus.Completed };
		await writeTaskChange(TEST_EMAIL, before, done, NOW);
		expect(patches[0].body).toEqual({ description: `Agenda\n\n${DONE_MARK}` });

		google.standup = { ...standup, etag: '"2"', description: `Agenda\n\n${DONE_MARK}` };
		await writeTaskChange(TEST_EMAIL, done, before, NOW);
		expect(patches[1].body).toEqual({ description: 'Agenda' });
		expect(patches[1].ifMatch).toBe('"2"');
	});

	test('a change that is not about time or done sends nothing', async () => {
		const before = await followed();
		expect(await writeTaskChange(TEST_EMAIL, before, { ...before, title: 'Mine now' }, NOW)).toBe(
			'none'
		);
		expect(patches).toEqual([]);
	});

	test('when Google changed the event meanwhile, Google wins and the task goes back to its time', async () => {
		const before = await followed();
		google.standup = {
			...standup,
			etag: '"9"',
			start: { dateTime: '2026-10-14T14:00:00Z' },
			end: { dateTime: '2026-10-14T14:30:00Z' }
		};
		const outcome = await writeTaskChange(TEST_EMAIL, before, { ...before, startTime: 660 }, NOW);
		expect(outcome).toBe('googleWon');
		expect(patches).toEqual([]);
		expect(task().startTime).toBe(840);
	});

	test('a refused patch (412) is Google winning too', async () => {
		const before = await followed();
		patchStatus = 412;
		expect(await writeTaskChange(TEST_EMAIL, before, { ...before, duration: 60 }, NOW)).toBe(
			'googleWon'
		);
	});

	test('an event deleted in Google leaves the task to the next sync, nothing is made again', async () => {
		const before = await followed();
		delete google.standup;
		expect(await writeTaskChange(TEST_EMAIL, before, { ...before, startTime: 660 }, NOW)).toBe(
			'googleWon'
		);
		expect(created).toEqual([]);
		expect(db.select().from(tasks).all()).toEqual([]);
	});

	test('deleting it never deletes the event in Google', async () => {
		const before = await followed();
		db.delete(tasks).run();
		expect(await writeTaskChange(TEST_EMAIL, before, null, NOW)).toBe('none');
		expect(deleted).toEqual([]);
	});

	test('an event cut at midnight is read-only and nothing of it is written', async () => {
		google.standup = {
			...standup,
			start: { dateTime: '2026-10-14T23:00:00Z' },
			end: { dateTime: '2026-10-15T01:00:00Z' }
		};
		await previewCalendars(TEST_EMAIL, ['primary'], NOW);
		await importCalendars(TEST_EMAIL, 'all', NOW);
		const [first] = db.select().from(tasks).all();
		expect(isReadOnly(TEST_EMAIL, first.id)).toBe(true);
		expect(await writeTaskChange(TEST_EMAIL, first, { ...first, startTime: 0 }, NOW)).toBe('none');
		expect(patches).toEqual([]);
	});

	test('a failing Google leaves the plan as it is and says so', async () => {
		const before = await followed();
		patchStatus = 500;
		const log = spyOn(console, 'error').mockImplementation(() => {});
		const outcome = await writeTaskChange(TEST_EMAIL, before, { ...before, startTime: 660 }, NOW);
		log.mockRestore();
		expect(outcome).toBe('failed');
	});

	test('a grant Google dropped ends the link', async () => {
		const before = await followed();
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ error: 'invalid_grant' }, { status: 400 })
		});
		clearAccessTokens();
		expect(await writeTaskChange(TEST_EMAIL, before, { ...before, startTime: 660 }, NOW)).toBe(
			'failed'
		);
		expect(calendarState(TEST_EMAIL).status).toBe('none');
	});
});

describe('the setting to add my own tasks', () => {
	test('is off by default: a task of the user is not sent anywhere', async () => {
		await followed();
		const mine = ownTask();
		expect(await writeTaskChange(TEST_EMAIL, null, mine, NOW)).toBe('none');
		expect(created).toEqual([]);
	});

	test('a new task gets an event in the chosen calendar, with its time and notes', async () => {
		await followed();
		turnWritingOn();
		const mine = ownTask({ description: 'Quarterly numbers' });
		expect(await writeTaskChange(TEST_EMAIL, null, mine, NOW)).toBe('written');
		expect(created[0]).toMatchObject({
			summary: 'Write report',
			description: 'Quarterly numbers',
			start: { dateTime: '2026-10-15T09:00:00.000Z' },
			end: { dateTime: '2026-10-15T10:00:00.000Z' }
		});
		expect(
			db.select().from(calendarEvents).where(eq(calendarEvents.origin, 'app')).get()
		).toMatchObject({ eventId: 'made-1', taskIds: [mine.id], etag: '"m1"' });
	});

	test('changing the task changes its event, title included, without the etag guard', async () => {
		await followed();
		turnWritingOn();
		const mine = ownTask();
		await writeTaskChange(TEST_EMAIL, null, mine, NOW);
		google['made-1'] = { id: 'made-1', etag: '"edited-in-google"', summary: 'Write report' };
		const after = { ...mine, title: 'Write the report', startTime: 600 };
		expect(await writeTaskChange(TEST_EMAIL, mine, after, NOW)).toBe('written');
		expect(patches[0].body).toMatchObject({ summary: 'Write the report' });
		expect(patches[0].body).toHaveProperty('start');
	});

	test('deleting the task deletes the event the app made', async () => {
		await followed();
		turnWritingOn();
		const mine = ownTask();
		await writeTaskChange(TEST_EMAIL, null, mine, NOW);
		expect(await writeTaskChange(TEST_EMAIL, mine, null, NOW)).toBe('written');
		expect(deleted).toEqual(['made-1']);
		expect(db.select().from(calendarEvents).where(eq(calendarEvents.origin, 'app')).all()).toEqual(
			[]
		);
	});

	test('an event the user deleted in Google is made again with the next change', async () => {
		await followed();
		turnWritingOn();
		const mine = ownTask();
		await writeTaskChange(TEST_EMAIL, null, mine, NOW);
		delete google['made-1'];
		expect(await writeTaskChange(TEST_EMAIL, mine, { ...mine, startTime: 600 }, NOW)).toBe(
			'written'
		);
		expect(created).toHaveLength(2);
	});

	test('the read sync does not bring the app own events back as tasks', async () => {
		await followed();
		turnWritingOn();
		const mine = ownTask();
		await writeTaskChange(TEST_EMAIL, null, mine, NOW);
		const { syncCalendars } = await import('#lib/server/calendar.js');
		// Google lists the event the app made, with its time
		google['made-1'] = {
			id: 'made-1',
			etag: '"m1"',
			summary: 'Write report',
			start: { dateTime: '2026-10-15T09:00:00Z' },
			end: { dateTime: '2026-10-15T10:00:00Z' }
		};
		expect(await syncCalendars(TEST_EMAIL, NOW)).toEqual({ changed: false });
		expect(db.select().from(tasks).all()).toHaveLength(2);
	});

	test('stopping to follow keeps the link of the events the app made, so following again is not a second import', async () => {
		const { stopSync } = await import('#lib/server/calendar.js');
		await followed();
		turnWritingOn();
		await writeTaskChange(TEST_EMAIL, null, ownTask(), NOW);
		stopSync(TEST_EMAIL);
		expect(
			db
				.select()
				.from(calendarEvents)
				.all()
				.map((row) => row.origin)
		).toEqual(['app']);
	});
});

describe('chooseWriteCalendar', () => {
	const calendarList = (items: object[]) =>
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
			[`${API}/users/me/calendarList`]: () => Response.json({ items })
		});

	test('keeps a calendar the user can write to and turns it off again', async () => {
		await followed();
		calendarList([{ id: 'primary', accessRole: 'owner', primary: true }]);
		expect(await chooseWriteCalendar(TEST_EMAIL, 'primary', NOW)).toBe(true);
		expect(calendarState(TEST_EMAIL).writeCalendar).toBe('primary');
		expect(await chooseWriteCalendar(TEST_EMAIL, null, NOW)).toBe(true);
		expect(calendarState(TEST_EMAIL).writeCalendar).toBeNull();
	});

	test('refuses a calendar that is read only or unknown', async () => {
		await followed();
		calendarList([{ id: 'holidays', accessRole: 'reader' }]);
		expect(await chooseWriteCalendar(TEST_EMAIL, 'holidays', NOW)).toBe(false);
		expect(await chooseWriteCalendar(TEST_EMAIL, 'nope', NOW)).toBe(false);
		expect(calendarState(TEST_EMAIL).writeCalendar).toBeNull();
	});

	test('needs the calendars to be followed first', async () => {
		expect(await chooseWriteCalendar(TEST_EMAIL, null, NOW)).toBe(false);
	});
});
