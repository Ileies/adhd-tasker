import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { loadFlow, recordFlow } from '#lib/core/flow.js';
import { handler } from '#lib/server/route.js';
import { isDateKey } from '#lib/time.js';

/** The answers of one day (`?date=`), oldest first. */
export const GET: RequestHandler = handler(async ({ ctx, url }) => {
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await loadFlow(ctx, date));
});

/** Logs one answer. The body is `{ type, todoId?, taskId?, data?, key?, at? }`, `null` comes back when the key was logged already. */
export const POST: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await recordFlow(ctx, await json({})))
);
