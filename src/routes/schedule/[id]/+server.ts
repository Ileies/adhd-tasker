import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cancelEntry } from '#lib/core/schedule.js';
import { serverCtx } from '#lib/server/ctx.js';

/** Cancels one alarm or wakeup. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'Invalid id');
	if (!(await cancelEntry(serverCtx(locals.user.email), id))) error(404, 'No such alarm');
	return new Response(null, { status: 204 });
};
