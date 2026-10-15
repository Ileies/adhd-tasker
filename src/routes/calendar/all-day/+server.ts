import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allDayLines } from '#lib/server/calendar.js';
import { isDateKey } from '#lib/time.js';

/** The all-day events from `?from=` to `?to=` (days, inclusive), shown as one line per day on Plan. */
export const GET: RequestHandler = ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	if (!isDateKey(from) || !isDateKey(to)) error(400, 'Send from and to as dates, like 2026-10-14');
	return Response.json(allDayLines(locals.user.email, from, to));
};
