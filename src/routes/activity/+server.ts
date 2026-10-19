import type { RequestHandler } from './$types';
import { activityView } from '#lib/core/activity.js';
import { handler } from '#lib/server/route.js';

/** The same view the page loads with, for the refresh after an Undo. */
export const GET: RequestHandler = handler(async ({ ctx }) =>
	Response.json(await activityView(ctx))
);
