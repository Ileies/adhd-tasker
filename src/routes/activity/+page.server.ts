import type { PageServerLoad } from './$types';
import { activityView } from '#lib/core/activity.js';
import { serverCtx } from '#lib/server/ctx.js';

/**
 * What the assistant changed (with Undo), what it saw and what it did about it, and today's token use.
 * A guest has no account here: the page asks its own device for the same view.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	activity: locals.user ? await activityView(serverCtx(locals.user.email)) : null
});
