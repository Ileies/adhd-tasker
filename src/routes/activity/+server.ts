import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activityView } from '#lib/core/activity.js';
import { serverCtx } from '#lib/server/ctx.js';

/** The same view the page loads with, for the refresh after an Undo. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	return Response.json(await activityView(serverCtx(locals.user.email)));
};
