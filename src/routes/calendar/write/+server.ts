import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chooseWriteCalendar, withCalendar } from '#lib/server/calendar.js';
import { handler } from '#lib/server/route.js';

/**
 * Where the user's own tasks are added to Google Calendar: `{ calendar: id }`, or `{ calendar: null }` to stop
 * (the default). Only a calendar the user can write to, and only while calendars are followed.
 */
export const PUT: RequestHandler = handler(async ({ user, json }) => {
	const calendar = (await json())?.calendar;
	if (calendar !== null && (typeof calendar !== 'string' || calendar === ''))
		error(400, 'calendar must be a calendar id, or null to turn it off');

	const kept = await withCalendar(user, (email) =>
		chooseWriteCalendar(email, calendar, Date.now())
	);
	if (!kept) error(409, 'Follow your calendars first, and choose one you can add events to');
	return Response.json(true);
});
