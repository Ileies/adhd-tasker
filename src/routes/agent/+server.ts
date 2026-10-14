import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { agentFeed } from '#lib/core/feed.js';
import { serverCtx } from '#lib/server/ctx.js';

/**
 * What the agent did on its own since the client last asked: the open card for the Now screen, and
 * plan changes made by reactions (not by chat, the chat shows its own). `since` is the last action id the client saw,
 * without it only the cursor is returned.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const since = url.searchParams.has('since') ? Number(url.searchParams.get('since')) : null;
	return Response.json(await agentFeed(serverCtx(locals.user.email), since));
};
