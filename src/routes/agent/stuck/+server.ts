import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/core/context.js';
import { reportStuck } from '#lib/core/feed.js';
import { serverCtx } from '#lib/server/ctx.js';

/** "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this call. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	try {
		await reportStuck(serverCtx(locals.user.email), await request.json().catch(() => null));
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
	return Response.json({ ok: true });
};
