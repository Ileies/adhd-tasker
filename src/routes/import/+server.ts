import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importExport, parseExport } from '#lib/core/export.js';
import { handler } from '#lib/server/route.js';

/** Adds what an export file holds to the account. What is already there is left alone. */
export const POST: RequestHandler = handler(async ({ ctx, json }) => {
	const parsed = parseExport(await json());
	if (!parsed.ok) error(400, parsed.error);

	const result = await importExport(ctx.repo, parsed.value, ctx.now());
	// Open screens load the schedule again when alarms came in
	if (result.alarms > 0) ctx.hint({ type: 'schedule' });
	return Response.json(result);
});
