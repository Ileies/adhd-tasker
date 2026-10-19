import { isValidTimezone } from '#lib/time.js';
import { handler } from '#lib/server/route.js';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = handler(async ({ ctx, request }) => {
	const { timezone } = await request.json();
	if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
		return new Response('Invalid timezone', { status: 400 });
	}

	await ctx.repo.settings.update({ timezone });
	return Response.json(true);
});
