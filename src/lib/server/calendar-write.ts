/**
 * Writing the plan back to Google Calendar (local first plan 6.3). A task made from an event is the event's mirror:
 * moving or resizing it patches the event, marking it done adds a line to the description, and nothing ever deletes
 * a Google event the user made. Every patch of an imported event is guarded by its `etag`: when Google changed the
 * event meanwhile, Google wins, the sync brings its version back and the answer says so.
 *
 * With the setting "Add my tasks to Google Calendar" (off by default) the user's own tasks get events too, in the
 * calendar they chose. Those events belong to the app: they are changed and deleted with their task, and the read
 * sync leaves them alone.
 */
import { and, eq } from 'drizzle-orm';
import { eventPatch, taskEvent } from '#lib/core/calendar.js';
import { calendarState, clockOf, syncCalendars } from '#lib/server/calendar.js';
import { db } from '#lib/server/db/index.js';
import { calendarEvents } from '#lib/server/db/schema.js';
import {
	createEvent,
	deleteEvent,
	getEvent,
	GoogleAuthError,
	GoogleConflict,
	patchEvent
} from '#lib/server/google-calendar.js';
import { forgetGoogle } from '#lib/server/google-tokens.js';
import { TaskStatus } from '#lib/types.js';

/** The part of a task that is written. */
export interface Written {
	id: number;
	title: string;
	description: string;
	date: string;
	startTime: number;
	duration: number;
	status: string;
}

/**
 * What happened to Google: nothing to do, the event is in step, Google had changed the event (the task was set back
 * to Google's version), or Google could not be reached (the change stays in the plan only).
 */
export type WriteOutcome = 'none' | 'written' | 'googleWon' | 'failed';

type Link = typeof calendarEvents.$inferSelect;

const shape = (task: Written) => ({
	date: task.date,
	startTime: task.startTime,
	duration: task.duration,
	done: task.status === TaskStatus.Completed
});

/** The event a task was made from or was written to. */
function linkOf(email: string, taskId: number): Link | undefined {
	return db
		.select()
		.from(calendarEvents)
		.where(and(eq(calendarEvents.email, email), eq(calendarEvents.kind, 'timed')))
		.all()
		.find((row) => row.taskIds.includes(taskId));
}

/** A task cut at midnight from one event cannot be moved on its own, the whole event is Google's to change. */
export function isReadOnly(email: string, taskId: number): boolean {
	const link = linkOf(email, taskId);
	return link?.origin === 'google' && link.taskIds.length > 1;
}

const where = (row: Link) =>
	and(
		eq(calendarEvents.email, row.email),
		eq(calendarEvents.calendarId, row.calendarId),
		eq(calendarEvents.eventId, row.eventId)
	);

async function addEvent(email: string, calendarId: string, task: Written, now: number) {
	const { timezone } = clockOf(email, now);
	const made = await createEvent(
		email,
		now,
		calendarId,
		taskEvent({ ...task, done: task.status === TaskStatus.Completed }, timezone)
	);
	db.insert(calendarEvents)
		.values({
			email,
			calendarId,
			eventId: made.id,
			etag: made.etag,
			kind: 'timed',
			origin: 'app',
			title: task.title,
			dates: [task.date],
			taskIds: [task.id]
		})
		.onConflictDoNothing()
		.run();
}

async function patchLinked(
	email: string,
	link: Link,
	before: Written,
	after: Written,
	now: number
): Promise<WriteOutcome> {
	// The title follows only for events the app made, the title of a Google event is Google's
	const mine = link.origin === 'app';
	const { timezone } = clockOf(email, now);
	const event = await getEvent(email, now, link.calendarId, link.eventId);
	if (!event) {
		// Deleted in Google: an imported task follows on the next sync, one of the user's own gets a new event
		if (!mine) {
			await syncCalendars(email, now);
			return 'googleWon';
		}
		db.delete(calendarEvents).where(where(link)).run();
		const target = calendarState(email).writeCalendar;
		if (!target) return 'none';
		await addEvent(email, target, after, now);
		return 'written';
	}
	if (!mine && (event.etag ?? '') !== link.etag) {
		await syncCalendars(email, now);
		return 'googleWon';
	}
	const patch = eventPatch(shape(before), shape(after), timezone, event.description);
	const retitled = mine && before.title !== after.title;
	if (!patch && !retitled) return 'none';
	try {
		const etag = await patchEvent(email, now, link.calendarId, link.eventId, event.etag ?? '', {
			...patch,
			...(retitled && { summary: after.title })
		});
		db.update(calendarEvents)
			.set({ etag: etag ?? link.etag, title: mine ? after.title : link.title, dates: [after.date] })
			.where(where(link))
			.run();
		return 'written';
	} catch (failure) {
		if (!(failure instanceof GoogleConflict)) throw failure;
		await syncCalendars(email, now);
		return 'googleWon';
	}
}

/**
 * Brings Google in line with one change of a task of the user: `before` is `null` for a new task, `after` for a
 * deleted one. Never throws. A dropped grant ends the link, any other failure is logged and answered `failed`.
 */
export async function writeTaskChange(
	email: string,
	before: Written | null,
	after: Written | null,
	now: number
): Promise<WriteOutcome> {
	const task = after ?? before;
	if (!task) return 'none';
	const state = calendarState(email);
	if (state.status !== 'active') return 'none';
	const link = linkOf(email, task.id);
	if (!link && !state.writeCalendar) return 'none';
	// An event cut at midnight is shown as several tasks, none of them is written alone
	if (link?.origin === 'google' && link.taskIds.length > 1) return 'none';

	try {
		if (!after) {
			// Only events the app made go with their task. An imported event stays in Google
			if (link?.origin !== 'app') return 'none';
			await deleteEvent(email, now, link.calendarId, link.eventId);
			db.delete(calendarEvents).where(where(link)).run();
			return 'written';
		}
		if (link) return await patchLinked(email, link, before ?? after, after, now);
		await addEvent(email, state.writeCalendar!, after, now);
		return 'written';
	} catch (failure) {
		if (failure instanceof GoogleAuthError) forgetGoogle(email);
		else console.error('[calendar] writing to Google failed', failure);
		return 'failed';
	}
}
