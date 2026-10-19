import type { RequestHandler } from './$types';
import { listSnapshots } from '#lib/server/account.js';
import { handler } from '#lib/server/route.js';

/** The plans that can still be brought back, newest first. */
export const GET: RequestHandler = handler(({ user }) =>
	Response.json(listSnapshots(user.email, Date.now()), {
		headers: { 'Cache-Control': 'no-store' }
	})
);
