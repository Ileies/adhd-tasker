import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allDayLines } from '#lib/server/calendar.js';
import { handler } from '#lib/server/route.js';
import { isDateKey } from '#lib/time.js';

/** The all-day events from `?from=` to `?to=` (days, inclusive), shown as one line per day on Plan. */
export const GET: RequestHandler = handler(({ user, url }) => {
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	if (!isDateKey(from) || !isDateKey(to)) error(400, 'Send from and to as dates, like 2026-10-14');
	return Response.json(allDayLines(user.email, from, to));
});
