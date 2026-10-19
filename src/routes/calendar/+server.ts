import type { RequestHandler } from './$types';
import { calendarLinked, calendarState, stopSync, withCalendar } from '#lib/server/calendar.js';
import { listCalendars } from '#lib/server/google-calendar.js';
import { handler } from '#lib/server/route.js';

/** The state of the link, and the calendars the user can choose from once Calendar is linked. */
export const GET: RequestHandler = handler(async ({ user }) => {
	const state = calendarState(user.email);
	if (!calendarLinked(user.email)) return Response.json({ linked: false, state, calendars: [] });
	const calendars = await withCalendar(user, (email) => listCalendars(email, Date.now()));
	return Response.json({ linked: true, state, calendars });
});

/** Stops following the calendars. Tasks already imported stay in the plan. */
export const DELETE: RequestHandler = handler(({ user }) => {
	stopSync(user.email);
	return new Response(null, { status: 204 });
});
