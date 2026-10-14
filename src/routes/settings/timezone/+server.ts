import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { isValidTimezone } from '#lib/time.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const { timezone } = await request.json();
	if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
		return new Response('Invalid timezone', { status: 400 });
	}

	await db.update(users).set({ timezone }).where(eq(users.email, locals.user.email));
	return Response.json(true);
};
