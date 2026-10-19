import type { RequestHandler } from './$types';
import { reportStuck } from '#lib/core/feed.js';
import { handler } from '#lib/server/route.js';

/** "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this call. */
export const POST: RequestHandler = handler(async ({ ctx, json }) => {
	await reportStuck(ctx, await json());
	return Response.json({ ok: true });
});
