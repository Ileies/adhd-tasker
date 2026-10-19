import type { RequestHandler } from './$types';
import { dismissCard } from '#lib/core/feed.js';
import { handler } from '#lib/server/route.js';

/** Dismisses or answers a card. The answer itself is sent to the chat by the client. */
export const POST: RequestHandler = handler(async ({ ctx, params }) => {
	await dismissCard(ctx, Number(params.id));
	return Response.json({ ok: true });
});
