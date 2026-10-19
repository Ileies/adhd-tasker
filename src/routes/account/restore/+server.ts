import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreSnapshot } from '#lib/server/account.js';
import { handler } from '#lib/server/route.js';

/**
 * Brings a snapshot back: `{ id }`. The plan as it is now is stored as a snapshot first, so a restore can be
 * taken back too.
 */
export const POST: RequestHandler = handler(async ({ ctx, user, json }) => {
	const { id } = ((await json()) ?? {}) as { id?: unknown };
	if (typeof id !== 'number' || !Number.isInteger(id)) error(400, 'Send the id of a snapshot');

	let result;
	try {
		result = restoreSnapshot(user.email, id, ctx.now());
	} catch (failure) {
		console.error('[account] restore failed', failure);
		error(500, 'Could not restore the plan, nothing was changed');
	}
	if (!result) error(404, 'That plan is no longer kept');
	ctx.hint({ type: 'schedule' });
	return Response.json(result);
});
