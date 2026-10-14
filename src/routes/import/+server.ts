import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importExport, parseExport } from '#lib/core/export.js';
import { serverCtx } from '#lib/server/ctx.js';

/** Adds what an export file holds to the account. What is already there is left alone. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const parsed = parseExport(await request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.error);

	const ctx = serverCtx(locals.user.email);
	const result = await importExport(ctx.repo, parsed.value, ctx.now());
	// Open screens load the schedule again when alarms came in
	if (result.alarms > 0) ctx.hint({ type: 'schedule' });
	return Response.json(result);
};
