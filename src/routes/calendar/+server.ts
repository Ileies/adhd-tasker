import type { RequestHandler } from './$types';
import { calendarLinked, calendarState, stopSync, withCalendar } from '#lib/server/calendar.js';
import { listCalendars } from '#lib/server/google-calendar.js';

/** The state of the link, and the calendars the user can choose from once Calendar is linked. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return Response.json({ message: 'Login required' }, { status: 401 });
	const state = calendarState(locals.user.email);
	if (!calendarLinked(locals.user.email))
		return Response.json({ linked: false, state, calendars: [] });
	const calendars = await withCalendar(locals.user, (email) => listCalendars(email, Date.now()));
	return Response.json({ linked: true, state, calendars });
};

/** Stops following the calendars. Tasks already imported stay in the plan. */
export const DELETE: RequestHandler = ({ locals }) => {
	if (!locals.user) return Response.json({ message: 'Login required' }, { status: 401 });
	stopSync(locals.user.email);
	return new Response(null, { status: 204 });
};
