import type { RequestHandler } from './$types';
import { syncCalendars, withCalendar } from '#lib/server/calendar.js';
import { handler } from '#lib/server/route.js';

/** Brings the plan in line with the calendars now, instead of waiting for the next round. `{ changed }`. */
export const POST: RequestHandler = handler(async ({ user }) =>
	Response.json(await withCalendar(user, (email) => syncCalendars(email, Date.now())))
);
