import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { AssistantError } from '#lib/core/context.js';
import { loadFlow, recordFlow } from '#lib/core/flow.js';
import { serverCtx } from '#lib/server/ctx.js';
import { isDateKey } from '#lib/time.js';

/** The answers of one day (`?date=`), oldest first. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await loadFlow(serverCtx(locals.user.email), date));
};

/** Logs one answer. The body is `{ type, todoId?, taskId?, data?, key?, at? }`, `null` comes back when the key was logged already. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	const body = await request.json().catch(() => ({}));
	try {
		return Response.json(await recordFlow(ctx, body));
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
};
