/**
 * Google Calendar events as tasks (local first plan 6.2). Pure: the server fetches, these rules decide what an
 * event becomes, what a first import would clash with, and what a later sync adds, changes or removes.
 *
 * Timed events become tasks, split at midnight (a task never crosses it) and read-only when split. All-day events
 * are not tasks, they are one line on Plan.
 */
import type { NewTask } from '#lib/core/repo.js';
import { addDays, localMoment, zonedToEpoch, type DateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

/** How many days ahead events are read, from today. */
export const WINDOW_DAYS = 14;
/** A task is never shorter, see `parseDuration`. */
const MIN_DURATION = 5;
const MAX_ALL_DAY_SPAN = 31;
const MAX_TITLE = 200;
/** The priority an imported event starts with, changeable like any task's. */
export const EVENT_PRIORITY = Priority.High;

/** The part of a Google Calendar event the app reads. */
export interface CalendarEvent {
	id: string;
	status?: string;
	etag?: string;
	summary?: string;
	start?: { dateTime?: string; date?: string };
	end?: { dateTime?: string; date?: string };
}

/** One day's share of a timed event. */
export interface Piece {
	date: DateKey;
	startTime: number;
	duration: number;
}

export type Mapped =
	| { kind: 'timed'; title: string; pieces: Piece[]; readOnly: boolean }
	| { kind: 'allDay'; title: string; dates: DateKey[] }
	| { kind: 'skip' };

const titleOf = (event: CalendarEvent) =>
	(event.summary ?? '').trim().slice(0, MAX_TITLE) || '(no title)';

/** What an event becomes in the timezone of the user. Cancelled and malformed events are skipped. */
export function mapEvent(event: CalendarEvent, timezone: string): Mapped {
	if (event.status === 'cancelled' || !event.start || !event.end) return { kind: 'skip' };

	if (event.start.date) {
		const end = event.end.date;
		if (!end || end <= event.start.date) return { kind: 'skip' };
		const dates: DateKey[] = [];
		for (
			let day = event.start.date;
			day < end && dates.length < MAX_ALL_DAY_SPAN;
			day = addDays(day, 1)
		)
			dates.push(day);
		return { kind: 'allDay', title: titleOf(event), dates };
	}

	const start = Date.parse(event.start.dateTime ?? '');
	const end = Date.parse(event.end.dateTime ?? '');
	if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return { kind: 'skip' };

	// Seconds are dropped, as the plan counts whole minutes
	const first = localMoment(start, timezone);
	let { date, minutes } = first;
	let left = Math.max(1, Math.round((end - start) / 60_000));
	const pieces: Piece[] = [];
	while (left > 0 && pieces.length < MAX_ALL_DAY_SPAN) {
		const untilMidnight = Math.round(
			(zonedToEpoch(addDays(date, 1), 0, timezone) - zonedToEpoch(date, minutes, timezone)) / 60_000
		);
		// A day with a daylight saving change is 23 or 25 hours long, a task still fits the 1440 of a plan day
		const duration = Math.min(left, untilMidnight, 1440 - minutes);
		pieces.push({ date, startTime: minutes, duration });
		left -= duration;
		date = addDays(date, 1);
		minutes = 0;
	}

	// A sliver at the end of a day (an event ending at 00:02) is not worth a task of its own
	const long = pieces.filter((piece) => piece.duration >= MIN_DURATION);
	const kept = long.length > 0 ? long : pieces.slice(0, 1);
	const fitted = kept.map((piece) => {
		const duration = Math.max(MIN_DURATION, piece.duration);
		return { ...piece, duration, startTime: Math.min(piece.startTime, 1440 - duration) };
	});
	return { kind: 'timed', title: titleOf(event), pieces: fitted, readOnly: fitted.length > 1 };
}

/** The tasks of a timed event, one per piece. */
export function piecesToTasks(mapped: Extract<Mapped, { kind: 'timed' }>): NewTask[] {
	return mapped.pieces.map((piece) => ({
		title: mapped.title,
		description: '',
		date: piece.date,
		startTime: piece.startTime,
		duration: piece.duration,
		priority: EVENT_PRIORITY
	}));
}

/** The first and last day events are read for, today and the days after it. */
export const windowFor = (today: DateKey): { from: DateKey; to: DateKey } => ({
	from: today,
	to: addDays(today, WINDOW_DAYS)
});

/** The instants Google is asked about, `timeMax` is the end of the last day. */
export function windowInstants(today: DateKey, timezone: string) {
	const { from, to } = windowFor(today);
	return {
		timeMin: new Date(zonedToEpoch(from, 0, timezone)).toISOString(),
		timeMax: new Date(zonedToEpoch(addDays(to, 1), 0, timezone)).toISOString()
	};
}

/** A task of the plan, as far as clashes are concerned. */
export interface PlanSlot {
	date: DateKey;
	startTime: number;
	duration: number;
	title: string;
}

const overlaps = (a: Piece, b: Piece) =>
	a.startTime < b.startTime + b.duration && b.startTime < a.startTime + a.duration;

/** The event and the plan task it shares time with. */
export interface Clash {
	date: DateKey;
	event: { title: string; startTime: number; duration: number };
	tasks: PlanSlot[];
}

export interface Preview {
	/** Events in the window, timed and all-day. */
	events: number;
	timed: number;
	allDay: number;
	/** Timed events that share time with a task of the plan. */
	clashing: number;
	/** Oldest day first. */
	clashes: Clash[];
}

/** Events with the pieces that were read for them, to count what an import would do. */
export interface Fetched {
	calendarId: string;
	event: CalendarEvent;
	mapped: Mapped;
}

/** Whether any piece of a timed event shares time with the plan. */
export const clashesWith = (mapped: Mapped, plan: PlanSlot[]) =>
	mapped.kind === 'timed' &&
	mapped.pieces.some((piece) =>
		plan.some((slot) => slot.date === piece.date && overlaps(piece, slot))
	);

/**
 * What a first import would bring and how much of it clashes with the plan, so the user can choose before
 * anything is written. A task that is already in the plan is not a clash with itself: only the plan counts.
 */
export function previewImport(
	items: Fetched[],
	plan: PlanSlot[],
	window: { from: DateKey; to: DateKey }
): Preview {
	const clashes: Clash[] = [];
	let timed = 0;
	let allDay = 0;
	let clashing = 0;
	for (const { mapped } of items) {
		if (mapped.kind === 'allDay') {
			if (mapped.dates.some((day) => day >= window.from && day <= window.to)) allDay++;
			continue;
		}
		if (mapped.kind !== 'timed') continue;
		const inside = mapped.pieces.filter(
			(piece) => piece.date >= window.from && piece.date <= window.to
		);
		if (inside.length === 0) continue;
		timed++;
		let clashed = false;
		for (const piece of inside) {
			const tasks = plan.filter((slot) => slot.date === piece.date && overlaps(piece, slot));
			if (tasks.length === 0) continue;
			clashed = true;
			clashes.push({
				date: piece.date,
				event: { title: mapped.title, startTime: piece.startTime, duration: piece.duration },
				tasks
			});
		}
		if (clashed) clashing++;
	}
	clashes.sort((a, b) => a.date.localeCompare(b.date) || a.event.startTime - b.event.startTime);
	return { events: timed + allDay, timed, allDay, clashing, clashes };
}

/** What the app remembers of an event it imported. */
export interface KnownEvent {
	calendarId: string;
	eventId: string;
	etag: string;
	kind: 'timed' | 'allDay';
	/** The tasks made from it, empty when none was made (clash on import, or the user deleted them). */
	taskIds: number[];
	/** All-day: the days it covers. Timed: the days of its pieces. */
	dates: DateKey[];
}

export interface SyncPlan {
	add: Fetched[];
	/** Events whose etag changed. */
	change: { known: KnownEvent; fetched: Fetched }[];
	/** Events Google no longer has in the window. */
	remove: KnownEvent[];
}

/**
 * Compares what Google has in the window with what was imported before. Anything Google lists that is new is
 * added, an event with another etag is changed, an event that was imported and has vanished from a window that
 * covers it is removed. Events before the window are history and never touched.
 */
export function planSync(
	fetched: Fetched[],
	known: KnownEvent[],
	window: { from: DateKey; to: DateKey }
): SyncPlan {
	const key = (calendarId: string, eventId: string) => `${calendarId}\n${eventId}`;
	const byKey = new Map(known.map((event) => [key(event.calendarId, event.eventId), event]));
	const seen = new Set<string>();
	const plan: SyncPlan = { add: [], change: [], remove: [] };

	for (const item of fetched) {
		if (item.mapped.kind === 'skip') continue;
		const id = key(item.calendarId, item.event.id);
		seen.add(id);
		const before = byKey.get(id);
		if (!before) plan.add.push(item);
		else if (before.etag !== (item.event.etag ?? ''))
			plan.change.push({ known: before, fetched: item });
	}
	for (const event of known) {
		if (seen.has(key(event.calendarId, event.eventId))) continue;
		const last = event.dates.at(-1);
		// Gone from Google, or moved out of the window. Past events stay as they were.
		if (last !== undefined && last >= window.from) plan.remove.push(event);
	}
	return plan;
}

/** The days an event covers, for what is remembered of it. */
export const datesOf = (mapped: Mapped): DateKey[] =>
	mapped.kind === 'timed'
		? [...new Set(mapped.pieces.map((piece) => piece.date))]
		: mapped.kind === 'allDay'
			? mapped.dates
			: [];

/** A calendar the user can read. */
export interface CalendarInfo {
	id: string;
	name: string;
	primary: boolean;
}

/** Where the link to the calendars is: not started, chosen and previewed, or followed. */
export interface CalendarState {
	status: 'none' | 'preview' | 'active';
	calendars: string[];
	syncedAt: number | null;
}

/** What Settings needs to draw the calendar card. `calendars` is empty until Calendar is linked. */
export interface CalendarOverview {
	linked: boolean;
	state: CalendarState;
	calendars: CalendarInfo[];
}

/** How the first import treats events that share time with a task of the plan. */
export type ImportMode = 'all' | 'noClash';
export const IMPORT_MODES: readonly ImportMode[] = ['all', 'noClash'];

export interface CalendarImport {
	/** Tasks made. */
	tasks: number;
	/** Timed events left out because they clash with the plan. */
	left: number;
	/** All-day events, shown on Plan. */
	allDay: number;
}

/** An all-day event on one day, the line on Plan. */
export interface AllDayLine {
	date: DateKey;
	title: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The sentence above the choice: what is coming and how much of it clashes. */
export function describePreview(preview: Preview): string {
	if (preview.events === 0) return `Your calendar has no events in the next ${WINDOW_DAYS} days.`;
	const base = `Your calendar has ${plural(preview.events, 'event')} in the next ${WINDOW_DAYS} days`;
	return preview.clashing > 0
		? `${base}, ${preview.clashing} of them at the same time as tasks in your plan.`
		: `${base}, none of them at the same time as tasks in your plan.`;
}

/** The sentence that tells what an import did. */
export function describeCalendarImport({ tasks, left, allDay }: CalendarImport): string {
	const parts = [`${plural(tasks, 'task')} added to your plan`];
	if (allDay) parts.push(`${plural(allDay, 'all-day event')} shown on Plan`);
	if (left) parts.push(`${plural(left, 'event')} left out because they clash`);
	return `${parts.join(', ')}.`;
}
