import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildExport, exportFileName } from '#lib/core/export.js';
import { serverCtx } from '#lib/server/ctx.js';
import { todayIn } from '#lib/time.js';

/** Everything the user may take with them: the plan, the alarms and the settings that are theirs. Never the OpenAI key. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	const file = await buildExport(ctx.repo, ctx.now());
	return Response.json(file, {
		headers: {
			'Content-Disposition': `attachment; filename="${exportFileName(todayIn(locals.user.timezone ?? 'UTC', new Date(ctx.now())))}"`,
			'Cache-Control': 'no-store'
		}
	});
};
