import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/core/context.js';
import { dismissCard } from '#lib/core/feed.js';
import { serverCtx } from '#lib/server/ctx.js';

/** Dismisses or answers a card. The answer itself is sent to the chat by the client. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Login required');
	try {
		await dismissCard(serverCtx(locals.user.email), Number(params.id));
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
	return Response.json({ ok: true });
};
