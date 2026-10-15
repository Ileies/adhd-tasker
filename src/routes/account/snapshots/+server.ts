import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSnapshots } from '#lib/server/account.js';

/** The plans that can still be brought back, newest first. */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	return Response.json(listSnapshots(locals.user.email, Date.now()), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
