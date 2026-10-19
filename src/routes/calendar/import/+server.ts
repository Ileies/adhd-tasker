import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { IMPORT_MODES } from '#lib/core/calendar.js';
import { importCalendars, withCalendar } from '#lib/server/calendar.js';
import { handler } from '#lib/server/route.js';

/**
 * The first import, after the preview: `{ mode: 'all' | 'noClash' }`. Writes in one transaction and answers what
 * it did. Needs a preview first.
 */
export const POST: RequestHandler = handler(async ({ user, json }) => {
	const body = await json();
	const mode = IMPORT_MODES.find((known) => known === body?.mode);
	if (!mode) error(400, 'Choose how to import: all or noClash');

	const result = await withCalendar(user, (email) => importCalendars(email, mode, Date.now()));
	if (!result) error(409, 'Look at the preview first');
	return Response.json(result);
});
