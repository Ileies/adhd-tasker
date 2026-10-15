import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { IMPORT_MODES, importCalendars, withCalendar } from '#lib/server/calendar.js';

/**
 * The first import, after the preview: `{ mode: 'all' | 'noClash' }`. Writes in one transaction and answers what
 * it did. Needs a preview first.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
	const mode = IMPORT_MODES.find((known) => known === body?.mode);
	if (!mode) error(400, 'Choose how to import: all or noClash');

	const result = await withCalendar(locals.user, (email) =>
		importCalendars(email, mode, Date.now())
	);
	if (!result) error(409, 'Look at the preview first');
	return Response.json(result);
};
