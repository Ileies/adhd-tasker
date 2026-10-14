import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseMessages } from '#lib/core/assistant.js';
import { AssistantError } from '#lib/core/context.js';
import { runAssistant } from '#lib/server/assistant.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const body = await request.json().catch(() => null);
	try {
		return Response.json(await runAssistant(locals.user.email, parseMessages(body?.messages)));
	} catch (e) {
		if (e instanceof AssistantError) error(e.status as 400, e.message);
		console.error('Assistant error:', e);
		error(500, 'The assistant failed, try again');
	}
};
