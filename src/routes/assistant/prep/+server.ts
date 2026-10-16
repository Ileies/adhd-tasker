import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/core/context.js';
import { suggestSteps } from '#lib/server/assistant.js';

/** The steps the assistant suggests for an appointment. Nothing is stored, the prep sheet adds what the user keeps. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const { id } = await request.json().catch(() => ({}));
	try {
		return Response.json(await suggestSteps(locals.user.email, id));
	} catch (e) {
		if (e instanceof AssistantError) error(e.status as 400, e.message);
		console.error('Prep suggestion error:', e);
		error(500, 'The assistant failed, try again');
	}
};
