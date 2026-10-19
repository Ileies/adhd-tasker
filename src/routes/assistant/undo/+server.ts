import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { undoAction } from '#lib/core/assistant.js';
import { handler } from '#lib/server/route.js';

export const POST: RequestHandler = handler(async ({ ctx, json }) => {
	const { id } = await json({});
	if (!Number.isInteger(id)) error(400, 'id must be a change id');

	return Response.json(await undoAction(ctx, id));
});
