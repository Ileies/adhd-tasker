import type { RequestHandler } from './$types';
import { syncCalendars, withCalendar } from '#lib/server/calendar.js';

/** Brings the plan in line with the calendars now, instead of waiting for the next round. `{ changed }`. */
export const POST: RequestHandler = async ({ locals }) =>
	Response.json(await withCalendar(locals.user, (email) => syncCalendars(email, Date.now())));
