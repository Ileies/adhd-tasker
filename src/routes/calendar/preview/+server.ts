import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_CALENDARS, previewCalendars, withCalendar } from '#lib/server/calendar.js';
import { handler } from '#lib/server/route.js';

/**
 * The first look at the calendars the user chose: how many events are coming and how many clash with the plan.
 * `{ calendars: string[] }`. Changes nothing in the plan or in Google.
 */
export const POST: RequestHandler = handler(async ({ user, json }) => {
	const calendars = (await json())?.calendars;
	if (
		!Array.isArray(calendars) ||
		calendars.length === 0 ||
		calendars.length > MAX_CALENDARS ||
		!calendars.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 300)
	)
		error(400, 'Choose between 1 and 20 calendars');

	const preview = await withCalendar(user, (email) =>
		previewCalendars(email, [...new Set(calendars as string[])], Date.now())
	);
	if (!preview) error(409, 'Your calendars are already followed, stop following them first');
	return Response.json(preview);
});
