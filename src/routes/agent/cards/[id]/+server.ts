import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbRepo } from '#lib/server/db-repo.js';

/** Dismisses or answers a card. The answer itself is sent to the chat by the client. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'id must be a card id');

	if (!(await dbRepo(locals.user.email).cards.resolve(id, Date.now())))
		error(404, 'No such open card');
	return Response.json({ ok: true });
};
