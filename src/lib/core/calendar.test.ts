/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	clashesWith,
	datesOf,
	describeCalendarImport,
	describePreview,
	EVENT_PRIORITY,
	mapEvent,
	piecesToTasks,
	planSync,
	previewImport,
	windowFor,
	windowInstants,
	type CalendarEvent,
	type Fetched,
	type KnownEvent,
	type Mapped,
	type PlanSlot
} from '#lib/core/calendar.js';

const timed = (summary: string, start: string, end: string, extra: Partial<CalendarEvent> = {}) =>
	({
		id: summary,
		etag: '"1"',
		summary,
		start: { dateTime: start },
		end: { dateTime: end },
		...extra
	}) satisfies CalendarEvent;

const timedPieces = (mapped: Mapped) => {
	if (mapped.kind !== 'timed') throw new Error(`expected a timed event, got ${mapped.kind}`);
	return mapped;
};

describe('mapEvent', () => {
	test('a timed event is one task on the wall clock of the user, not the event', () => {
		const mapped = timedPieces(
			mapEvent(
				timed('Standup', '2026-10-14T10:00:00+02:00', '2026-10-14T10:30:00+02:00'),
				'Asia/Tokyo'
			)
		);
		// 08:00 UTC is 17:00 in Tokyo
		expect(mapped.pieces).toEqual([{ date: '2026-10-14', startTime: 1020, duration: 30 }]);
		expect(mapped.readOnly).toBe(false);
	});

	test('an event across midnight is split per day and read only', () => {
		const mapped = timedPieces(
			mapEvent(timed('Party', '2026-10-14T22:00:00Z', '2026-10-15T02:00:00Z'), 'UTC')
		);
		expect(mapped.pieces).toEqual([
			{ date: '2026-10-14', startTime: 1320, duration: 120 },
			{ date: '2026-10-15', startTime: 0, duration: 120 }
		]);
		expect(mapped.readOnly).toBe(true);
	});

	test('an event over several days gets a piece for every day', () => {
		const mapped = timedPieces(
			mapEvent(timed('Trip', '2026-10-14T20:00:00Z', '2026-10-16T08:00:00Z'), 'UTC')
		);
		expect(mapped.pieces.map((piece) => [piece.date, piece.startTime, piece.duration])).toEqual([
			['2026-10-14', 1200, 240],
			['2026-10-15', 0, 1440],
			['2026-10-16', 0, 480]
		]);
	});

	test('a sliver past midnight is dropped, the event stays a single task', () => {
		const mapped = timedPieces(
			mapEvent(timed('Late', '2026-10-14T23:00:00Z', '2026-10-15T00:02:00Z'), 'UTC')
		);
		expect(mapped.pieces).toEqual([{ date: '2026-10-14', startTime: 1380, duration: 60 }]);
		expect(mapped.readOnly).toBe(false);
	});

	test('a very short event is a task of 5 minutes, kept inside the day', () => {
		expect(
			timedPieces(mapEvent(timed('Ping', '2026-10-14T12:00:00Z', '2026-10-14T12:01:00Z'), 'UTC'))
				.pieces
		).toEqual([{ date: '2026-10-14', startTime: 720, duration: 5 }]);
		expect(
			timedPieces(mapEvent(timed('End', '2026-10-14T23:58:00Z', '2026-10-14T23:59:00Z'), 'UTC'))
				.pieces
		).toEqual([{ date: '2026-10-14', startTime: 1435, duration: 5 }]);
	});

	test('a day with a daylight saving change has its real length', () => {
		// Berlin on 2026-10-25 has 25 hours, a plan day still holds 1440 minutes and the rest goes to the next day
		const mapped = timedPieces(
			mapEvent(timed('Night', '2026-10-24T22:00:00Z', '2026-10-25T23:30:00Z'), 'Europe/Berlin')
		);
		expect(mapped.pieces.map((piece) => piece.date)).toEqual(['2026-10-25', '2026-10-26']);
		expect(mapped.pieces[0]).toMatchObject({ startTime: 0, duration: 1440 });
	});

	test('an all-day event is the days it covers, the end day is exclusive', () => {
		expect(
			mapEvent(
				{ id: 'a', summary: 'Holiday', start: { date: '2026-10-14' }, end: { date: '2026-10-17' } },
				'UTC'
			)
		).toEqual({
			kind: 'allDay',
			title: 'Holiday',
			dates: ['2026-10-14', '2026-10-15', '2026-10-16']
		});
	});

	test('a year long all-day event is cut at a month, not listed for 365 days', () => {
		const mapped = mapEvent(
			{ id: 'a', summary: 'Year', start: { date: '2026-01-01' }, end: { date: '2027-01-01' } },
			'UTC'
		);
		expect(mapped.kind === 'allDay' && mapped.dates).toHaveLength(31);
	});

	test('a title is trimmed, cut at 200 and filled in when empty', () => {
		const title = (summary: string | undefined) =>
			timedPieces(
				mapEvent(timed('x', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z', { summary }), 'UTC')
			).title;
		expect(title('  Review  ')).toBe('Review');
		expect(title('x'.repeat(300))).toHaveLength(200);
		expect(title(undefined)).toBe('(no title)');
		expect(title('   ')).toBe('(no title)');
	});

	test.each([
		[
			'a cancelled event',
			timed('a', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z', { status: 'cancelled' })
		],
		['an event without an end', { id: 'a', start: { dateTime: '2026-10-14T10:00:00Z' } }],
		['an end before the start', timed('a', '2026-10-14T11:00:00Z', '2026-10-14T10:00:00Z')],
		['a start that is no date', timed('a', 'soon', '2026-10-14T10:00:00Z')],
		[
			'an all-day event that ends before it starts',
			{ id: 'a', start: { date: '2026-10-14' }, end: { date: '2026-10-14' } }
		]
	])('skips %s', (_name, event) => {
		expect(mapEvent(event as CalendarEvent, 'UTC')).toEqual({ kind: 'skip' });
	});
});

describe('piecesToTasks', () => {
	test('every piece is a task with the default priority and no description', () => {
		const mapped = timedPieces(
			mapEvent(timed('Party', '2026-10-14T22:00:00Z', '2026-10-15T02:00:00Z'), 'UTC')
		);
		const tasks = piecesToTasks(mapped);
		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toEqual({
			title: 'Party',
			description: '',
			date: '2026-10-14',
			startTime: 1320,
			duration: 120,
			priority: EVENT_PRIORITY
		});
	});
});

describe('windowFor and windowInstants', () => {
	test('reads today and the 14 days after it', () => {
		expect(windowFor('2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-28' });
	});

	test('asks Google from the start of today to the end of the last day, on the wall of the user', () => {
		expect(windowInstants('2026-10-14', 'Asia/Tokyo')).toEqual({
			timeMin: '2026-10-13T15:00:00.000Z',
			timeMax: '2026-10-28T15:00:00.000Z'
		});
	});
});

const day = '2026-10-14';
const slot = (startTime: number, duration: number, date = day): PlanSlot => ({
	date,
	startTime,
	duration,
	title: 'Mine'
});
const fetched = (event: CalendarEvent, calendarId = 'cal', timezone = 'UTC'): Fetched => ({
	calendarId,
	event,
	mapped: mapEvent(event, timezone)
});
const window = windowFor(day);

describe('previewImport', () => {
	const standup = fetched(timed('Standup', '2026-10-14T10:00:00Z', '2026-10-14T10:30:00Z'));
	const lunch = fetched(timed('Lunch', '2026-10-15T12:00:00Z', '2026-10-15T13:00:00Z'));
	const holiday = fetched({
		id: 'h',
		summary: 'Holiday',
		start: { date: '2026-10-20' },
		end: { date: '2026-10-21' }
	});

	test('counts timed and all-day events apart', () => {
		expect(previewImport([standup, lunch, holiday], [], window)).toMatchObject({
			events: 3,
			timed: 2,
			allDay: 1,
			clashing: 0,
			clashes: []
		});
	});

	test('an event that shares time with a task clashes, and the clash names both', () => {
		const result = previewImport([standup, lunch], [slot(615, 60)], window);
		expect(result.clashing).toBe(1);
		expect(result.clashes).toEqual([
			{
				date: day,
				event: { title: 'Standup', startTime: 600, duration: 30 },
				tasks: [slot(615, 60)]
			}
		]);
	});

	test('touching is not a clash, and another day is not either', () => {
		expect(
			previewImport([standup], [slot(630, 60), slot(600, 30, '2026-10-15')], window).clashing
		).toBe(0);
	});

	test('an event that clashes on two days counts once, with both clashes listed', () => {
		const party = fetched(timed('Party', '2026-10-14T23:00:00Z', '2026-10-15T01:00:00Z'));
		const result = previewImport([party], [slot(1380, 30), slot(0, 30, '2026-10-15')], window);
		expect(result.clashing).toBe(1);
		expect(result.clashes.map((clash) => clash.date)).toEqual([day, '2026-10-15']);
	});

	test('events outside the window and ones that were skipped do not count', () => {
		const later = fetched(timed('Later', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'));
		const cancelled = fetched(
			timed('Gone', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z', { status: 'cancelled' })
		);
		expect(previewImport([later, cancelled], [slot(600, 60)], window).events).toBe(0);
	});
});

describe('clashesWith', () => {
	test('only a timed event can clash', () => {
		expect(clashesWith({ kind: 'allDay', title: 'x', dates: [day] }, [slot(0, 1440)])).toBe(false);
		expect(clashesWith({ kind: 'skip' }, [slot(0, 1440)])).toBe(false);
		expect(
			clashesWith(mapEvent(timed('a', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z'), 'UTC'), [
				slot(630, 10)
			])
		).toBe(true);
	});
});

describe('planSync', () => {
	const known = (eventId: string, overrides: Partial<KnownEvent> = {}): KnownEvent => ({
		calendarId: 'cal',
		eventId,
		etag: '"1"',
		kind: 'timed',
		taskIds: [1],
		dates: [day],
		...overrides
	});
	const event = (id: string, etag = '"1"', date = day) =>
		fetched(timed(id, `${date}T10:00:00Z`, `${date}T11:00:00Z`, { etag }));

	test('an event that is new is added', () => {
		expect(planSync([event('a')], [], window).add).toHaveLength(1);
	});

	test('an event with the same etag is left alone', () => {
		expect(planSync([event('a')], [known('a')], window)).toEqual({
			add: [],
			change: [],
			remove: []
		});
	});

	test('another etag means it changed', () => {
		const plan = planSync([event('a', '"2"')], [known('a')], window);
		expect(plan.change.map((c) => c.known.eventId)).toEqual(['a']);
		expect(plan.add).toEqual([]);
	});

	test('an event Google no longer lists is removed, while a past one stays', () => {
		const old = known('old', { dates: ['2026-10-01'] });
		const plan = planSync([], [known('a'), old], window);
		expect(plan.remove.map((e) => e.eventId)).toEqual(['a']);
	});

	test('the same event id in another calendar is another event', () => {
		const plan = planSync([fetched(event('a').event, 'other')], [known('a')], window);
		expect(plan.add).toHaveLength(1);
		expect(plan.remove).toHaveLength(1);
	});

	test('a cancelled event Google still lists counts as gone', () => {
		const cancelled = fetched(
			timed('a', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z', { status: 'cancelled' })
		);
		const plan = planSync([cancelled], [known('a')], window);
		expect(plan.remove).toHaveLength(1);
		expect(plan.add).toEqual([]);
	});

	test('an event skipped on import stays known, so it is not added by the next sync', () => {
		expect(planSync([event('a')], [known('a', { taskIds: [] })], window).add).toEqual([]);
	});
});

describe('datesOf', () => {
	test('days of the pieces, the days of an all-day event, none for a skipped one', () => {
		expect(
			datesOf(mapEvent(timed('a', '2026-10-14T23:00:00Z', '2026-10-15T01:00:00Z'), 'UTC'))
		).toEqual(['2026-10-14', '2026-10-15']);
		expect(datesOf({ kind: 'allDay', title: 'x', dates: ['2026-10-14'] })).toEqual(['2026-10-14']);
		expect(datesOf({ kind: 'skip' })).toEqual([]);
	});
});

describe('describePreview', () => {
	const preview = (events: number, clashing: number) => ({
		events,
		timed: events,
		allDay: 0,
		clashing,
		clashes: []
	});

	test('says how many events are coming and how many clash', () => {
		expect(describePreview(preview(34, 9))).toBe(
			'Your calendar has 34 events in the next 14 days, 9 of them at the same time as tasks in your plan.'
		);
	});

	test('says so when nothing clashes, and when nothing is coming', () => {
		expect(describePreview(preview(1, 0))).toBe(
			'Your calendar has 1 event in the next 14 days, none of them at the same time as tasks in your plan.'
		);
		expect(describePreview(preview(0, 0))).toBe('Your calendar has no events in the next 14 days.');
	});
});

describe('describeCalendarImport', () => {
	test('names what was added, and only what there is to say', () => {
		expect(describeCalendarImport({ tasks: 3, left: 0, allDay: 0 })).toBe(
			'3 tasks added to your plan.'
		);
		expect(describeCalendarImport({ tasks: 1, left: 2, allDay: 1 })).toBe(
			'1 task added to your plan, 1 all-day event shown on Plan, 2 events left out because they clash.'
		);
	});
});
