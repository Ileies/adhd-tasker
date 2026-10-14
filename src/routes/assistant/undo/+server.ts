import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError, undoAction } from '#lib/server/assistant.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const { id } = await request.json().catch(() => ({}));
	if (!Number.isInteger(id)) error(400, 'id must be a change id');

	try {
		return Response.json(await undoAction(locals.user.email, id));
	} catch (e) {
		if (e instanceof AssistantError) error(e.status as 404, e.message);
		throw e;
	}
};
