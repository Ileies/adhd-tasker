import { isValidTimezone } from '#lib/time.js';
import { dbRepo } from '#lib/server/db-repo.js';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const { timezone } = await request.json();
	if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
		return new Response('Invalid timezone', { status: 400 });
	}

	await dbRepo(locals.user.email).settings.update({ timezone });
	return Response.json(true);
};
