import type { RequestHandler } from './$types';
import { buildExport, exportFileName } from '#lib/core/export.js';
import { handler } from '#lib/server/route.js';
import { todayIn } from '#lib/time.js';

/** Everything the user may take with them: the plan, the alarms and the settings that are theirs. Never the OpenAI key. */
export const GET: RequestHandler = handler(async ({ ctx, user }) => {
	const file = await buildExport(ctx.repo, ctx.now());
	return Response.json(file, {
		headers: {
			'Content-Disposition': `attachment; filename="${exportFileName(todayIn(user.timezone ?? 'UTC', new Date(ctx.now())))}"`,
			'Cache-Control': 'no-store'
		}
	});
});
