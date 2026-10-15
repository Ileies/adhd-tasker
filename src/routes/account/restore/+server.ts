import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreSnapshot } from '#lib/server/account.js';
import { serverCtx } from '#lib/server/ctx.js';

/**
 * Brings a snapshot back: `{ id }`. The plan as it is now is stored as a snapshot first, so a restore can be
 * taken back too.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const { id } = ((await request.json().catch(() => null)) ?? {}) as { id?: unknown };
	if (typeof id !== 'number' || !Number.isInteger(id)) error(400, 'Send the id of a snapshot');

	const ctx = serverCtx(locals.user.email);
	let result;
	try {
		result = restoreSnapshot(locals.user.email, id, ctx.now());
	} catch (failure) {
		console.error('[account] restore failed', failure);
		error(500, 'Could not restore the plan, nothing was changed');
	}
	if (!result) error(404, 'That plan is no longer kept');
	ctx.hint({ type: 'schedule' });
	return Response.json(result);
};
