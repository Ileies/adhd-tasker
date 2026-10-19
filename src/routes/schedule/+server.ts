import type { RequestHandler } from './$types';
import { addUserAlarm, scheduleOverview } from '#lib/core/schedule.js';
import { handler } from '#lib/server/route.js';

export const GET: RequestHandler = handler(async ({ ctx }) =>
	Response.json(await scheduleOverview(ctx))
);

export const POST: RequestHandler = handler(async ({ ctx, user, json }) => {
	const row = await addUserAlarm(ctx, await json(), user.timezone ?? 'UTC');
	return Response.json({ id: row.id }, { status: 201 });
});
