/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { CalendarEvent } from '#lib/core/calendar.js';
import {
	allDayLines,
	calendarState,
	importCalendars,
	previewCalendars,
	stopSync,
	syncCalendars,
	syncedUsers
} from '#lib/server/calendar.js';
import { db } from '#lib/server/db/index.js';
import { calendarEvents, googleTokens, tasks, users } from '#lib/server/db/schema.js';
import { API, GoogleAuthError, TOKEN_URL } from '#lib/server/google-calendar.js';
import { clearAccessTokens, storeRefreshToken } from '#lib/server/google-tokens.js';
import { fakeFetch } from '#test/fakes.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, makeTask, makeUser } from '#test/fixtures.js';
import { TaskStatus } from '#lib/types.js';

/** Eight in the morning on the day the plan starts, UTC is the timezone of the user. */
const NOW = Date.parse('2026-10-14T08:00:00Z');
const DAY = '2026-10-14';

let items: CalendarEvent[] = [];
let calls = 0;

const timed = (id: string, from: string, to: string, etag = '"1"'): CalendarEvent => ({
	id,
	etag,
	summary: id,
	start: { dateTime: `${from}:00Z` },
	end: { dateTime: `${to}:00Z` }
});
const holiday: CalendarEvent = {
	id: 'holiday',
	etag: '"1"',
	summary: 'Holiday',
	start: { date: '2026-10-20' },
	end: { date: '2026-10-22' }
};

beforeEach(async () => {
	await resetDb();
	clearAccessTokens();
	await makeUser({ googleServices: 'calendar', timezone: 'UTC' });
	storeRefreshToken(TEST_EMAIL, 'refresh', ['email'], 1);
	items = [];
	calls = 0;
	fakeFetch({
		[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'a', expires_in: 3600 }),
		[`${API}/calendars/primary/events`]: () => {
			calls++;
			return Response.json({ items });
		}
	});
});

const standup = () => timed('standup', '2026-10-14T10:00', '2026-10-14T10:30');
const lunch = () => timed('lunch', '2026-10-15T12:00', '2026-10-15T13:00');
const titles = () =>
	db
		.select()
		.from(tasks)
		.all()
		.map((task) => task.title);

/** A first import after a preview, the way the app does it. */
async function link(mode: 'all' | 'noClash' = 'all', events: CalendarEvent[] = items) {
	items = events;
	await previewCalendars(TEST_EMAIL, ['primary'], NOW);
	return importCalendars(TEST_EMAIL, mode, NOW);
}

describe('previewCalendars', () => {
	test('counts what is coming and what clashes, and writes only the choice of calendars', async () => {
		items = [standup(), lunch(), holiday];
		await makeTask({ title: 'Mine', date: DAY, startTime: 615, duration: 60 });
		const preview = await previewCalendars(TEST_EMAIL, ['primary'], NOW);
		expect(preview).toMatchObject({ events: 3, timed: 2, allDay: 1, clashing: 1 });
		expect(preview?.clashes[0]).toMatchObject({ date: DAY, event: { title: 'standup' } });
		expect(titles()).toEqual(['Mine']);
		expect(db.select().from(calendarEvents).all()).toEqual([]);
		expect(calendarState(TEST_EMAIL)).toMatchObject({ status: 'preview', calendars: ['primary'] });
	});

	test('asks Google only for the window of the plan', async () => {
		const urls: string[] = [];
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ access_token: 'b', expires_in: 3600 }),
			[`${API}/calendars/primary/events`]: (request) => {
				urls.push(request.url);
				return Response.json({ items: [] });
			}
		});
		await previewCalendars(TEST_EMAIL, ['primary'], NOW + 86_400_000 * 400);
		const query = new URL(urls[0]).searchParams;
		expect(query.get('timeMin')).toBe('2027-11-18T00:00:00.000Z');
		expect(query.get('timeMax')).toBe('2027-12-03T00:00:00.000Z');
	});

	test('a choice that is already followed has to be stopped before it is changed', async () => {
		await link();
		expect(await previewCalendars(TEST_EMAIL, ['primary'], NOW)).toBeNull();
	});

	test('a grant Google dropped ends the link instead of failing again every time', async () => {
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ error: 'invalid_grant' }, { status: 400 })
		});
		const error = await previewCalendars(TEST_EMAIL, ['primary'], NOW + 9e9).catch(
			(e: unknown) => e
		);
		expect(error).toBeInstanceOf(GoogleAuthError);
		expect(db.select().from(googleTokens).all()).toEqual([]);
		expect(db.select().from(users).get()?.googleServices).toBe('');
	});
});

describe('importCalendars', () => {
	test('needs a preview first, and the plan stays as it is without one', async () => {
		items = [standup()];
		expect(await importCalendars(TEST_EMAIL, 'all', NOW)).toBeNull();
		expect(titles()).toEqual([]);
	});

	test('all brings timed events in as tasks with the default priority and keeps clashes', async () => {
		await makeTask({ title: 'Mine', date: DAY, startTime: 615, duration: 60 });
		const result = await link('all', [standup(), lunch(), holiday]);
		expect(result).toEqual({ tasks: 2, left: 0, allDay: 1 });
		expect(titles().sort()).toEqual(['Mine', 'lunch', 'standup']);
		expect(db.select().from(tasks).where(eq(tasks.title, 'standup')).get()).toMatchObject({
			date: DAY,
			startTime: 600,
			duration: 30,
			priority: 3,
			status: 'pending'
		});
		expect(calendarState(TEST_EMAIL)).toMatchObject({ status: 'active', syncedAt: NOW });
	});

	test('an all-day event is a line on Plan and not a task', async () => {
		await link('all', [holiday]);
		expect(titles()).toEqual([]);
		expect(allDayLines(TEST_EMAIL, DAY, '2026-10-28')).toEqual([
			{ date: '2026-10-20', title: 'Holiday' },
			{ date: '2026-10-21', title: 'Holiday' }
		]);
		expect(allDayLines(TEST_EMAIL, DAY, '2026-10-20')).toHaveLength(1);
	});

	test('noClash leaves the clashing events out, and a later sync does not bring them in', async () => {
		await makeTask({ title: 'Mine', date: DAY, startTime: 615, duration: 60 });
		const result = await link('noClash', [standup(), lunch()]);
		expect(result).toEqual({ tasks: 1, left: 1, allDay: 0 });
		expect(titles().sort()).toEqual(['Mine', 'lunch']);
		expect(await syncCalendars(TEST_EMAIL, NOW + 300_000)).toEqual({ changed: false });
		expect(titles().sort()).toEqual(['Mine', 'lunch']);
	});

	test('an event that crosses midnight is two tasks', async () => {
		await link('all', [timed('party', '2026-10-14T22:00', '2026-10-15T02:00')]);
		expect(
			db
				.select()
				.from(tasks)
				.all()
				.map((task) => [task.date, task.startTime, task.duration])
		).toEqual([
			[DAY, 1320, 120],
			['2026-10-15', 0, 120]
		]);
	});

	test('the part of an event before today is history and not a task', async () => {
		await link('all', [timed('late', '2026-10-13T23:00', '2026-10-14T01:00')]);
		expect(
			db
				.select()
				.from(tasks)
				.all()
				.map((task) => [task.date, task.duration])
		).toEqual([[DAY, 60]]);
	});
});

describe('syncCalendars', () => {
	test('does nothing for a user who has not imported', async () => {
		items = [standup()];
		expect(await syncCalendars(TEST_EMAIL, NOW)).toEqual({ changed: false });
		expect(calls).toBe(0);
		await previewCalendars(TEST_EMAIL, ['primary'], NOW);
		expect(await syncCalendars(TEST_EMAIL, NOW)).toEqual({ changed: false });
	});

	test('adds a new event and leaves the rest alone', async () => {
		await link('all', [standup()]);
		items = [standup(), lunch()];
		expect(await syncCalendars(TEST_EMAIL, NOW + 300_000)).toEqual({ changed: true });
		expect(titles().sort()).toEqual(['lunch', 'standup']);
		expect(await syncCalendars(TEST_EMAIL, NOW + 600_000)).toEqual({ changed: false });
		expect(titles()).toHaveLength(2);
		expect(calendarState(TEST_EMAIL).syncedAt).toBe(NOW + 600_000);
	});

	test('a moved event moves its task, the priority and done state stay as the user set them', async () => {
		await link('all', [standup()]);
		const task = db.select().from(tasks).get();
		db.update(tasks)
			.set({ priority: 5, status: TaskStatus.Completed })
			.where(eq(tasks.id, task!.id))
			.run();
		items = [timed('standup', '2026-10-14T14:00', '2026-10-14T15:00', '"2"')];
		expect(await syncCalendars(TEST_EMAIL, NOW + 300_000)).toEqual({ changed: true });
		expect(db.select().from(tasks).all()).toEqual([
			{
				...task!,
				startTime: 840,
				duration: 60,
				priority: 5,
				status: TaskStatus.Completed
			}
		]);
	});

	test('a task the user deleted is not made again when the event changes', async () => {
		await link('all', [standup()]);
		db.delete(tasks).run();
		items = [timed('standup', '2026-10-14T14:00', '2026-10-14T15:00', '"2"')];
		await syncCalendars(TEST_EMAIL, NOW + 300_000);
		expect(titles()).toEqual([]);
		expect(db.select().from(calendarEvents).get()?.etag).toBe('"2"');
	});

	test('an event that now crosses midnight is replaced by its pieces', async () => {
		await link('all', [standup()]);
		items = [timed('standup', '2026-10-14T23:00', '2026-10-15T01:00', '"2"')];
		await syncCalendars(TEST_EMAIL, NOW + 300_000);
		expect(db.select().from(tasks).all()).toHaveLength(2);
		expect(db.select().from(calendarEvents).get()?.taskIds).toHaveLength(2);
	});

	test('an event Google no longer has takes its task with it', async () => {
		await link('all', [standup(), lunch()]);
		items = [lunch()];
		expect(await syncCalendars(TEST_EMAIL, NOW + 300_000)).toEqual({ changed: true });
		expect(titles()).toEqual(['lunch']);
		expect(db.select().from(calendarEvents).all()).toHaveLength(1);
	});

	test("another user's tasks are never touched", async () => {
		await makeUser({ email: 'other@example.com' });
		await makeTask({ title: 'Theirs', email: 'other@example.com', date: DAY });
		await link('all', [standup()]);
		items = [];
		await syncCalendars(TEST_EMAIL, NOW + 300_000);
		expect(titles()).toEqual(['Theirs']);
	});

	test('two syncs at once share one run', async () => {
		await link('all', [standup()]);
		const before = calls;
		await Promise.all([syncCalendars(TEST_EMAIL, NOW + 1), syncCalendars(TEST_EMAIL, NOW + 2)]);
		expect(calls - before).toBe(1);
	});

	test('a grant Google dropped ends the link and the error reaches the caller', async () => {
		await link('all', [standup()]);
		fakeFetch({
			[`POST ${TOKEN_URL}`]: () => Response.json({ error: 'invalid_grant' }, { status: 400 })
		});
		const error = await syncCalendars(TEST_EMAIL, NOW + 9e9).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(GoogleAuthError);
		expect(calendarState(TEST_EMAIL).status).toBe('none');
		expect(titles()).toEqual(['standup']);
	});
});

describe('stopSync', () => {
	test('stops following, the imported tasks stay', async () => {
		await link('all', [standup(), holiday]);
		expect(syncedUsers()).toEqual([TEST_EMAIL]);
		stopSync(TEST_EMAIL);
		expect(syncedUsers()).toEqual([]);
		expect(calendarState(TEST_EMAIL)).toEqual({
			status: 'none',
			calendars: [],
			syncedAt: null,
			writeCalendar: null
		});
		expect(titles()).toEqual(['standup']);
		expect(allDayLines(TEST_EMAIL, DAY, '2026-10-28')).toEqual([]);
	});
});
