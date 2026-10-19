/**
 * Google Calendar in the page: the all-day line on Plan and the sync that keeps the plan in step while a screen
 * is open (the server also syncs every 5 minutes with every screen closed). The rules and sentences are in
 * `core/calendar.ts`, the reading in `server/calendar.ts`.
 */
import { tasker } from '#lib/app.svelte.js';
import { describeCalendarImport, type ImportMode } from '#lib/core/calendar.js';
import { refreshAfterImport } from '#lib/data.js';
import { showToast } from '#lib/toast.js';

/** How often an open screen asks, the same as the server's own round. */
const SYNC_EVERY_MS = 5 * 60_000;

/** The all-day events of one day, for the line on Plan. A failed read leaves the line out. */
export async function loadAllDay(date: string) {
	tasker.calendar.allDay = await tasker.backend.calendar.allDay(date, date).catch(() => []);
}

/** Follows the calendars now. The plan is read again when it changed. A failure is quiet, the next round tries again. */
export async function syncCalendar() {
	try {
		if (await tasker.backend.calendar.sync()) await refreshAfterImport();
	} catch {
		// Not linked, offline or Google busy: nothing to tell the user in the middle of their day
	}
}

/** Syncs when a screen opens and every few minutes while it stays open. Answers how to stop. */
export function startCalendarSync(): () => void {
	void syncCalendar();
	const timer = setInterval(() => void syncCalendar(), SYNC_EVERY_MS);
	return () => clearInterval(timer);
}

/** The first import, after the preview. Answers the reason when it failed, `null` when it worked. */
export async function importCalendar(mode: ImportMode): Promise<string | null> {
	try {
		const result = await tasker.backend.calendar.import(mode);
		await refreshAfterImport();
		showToast(describeCalendarImport(result));
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}
