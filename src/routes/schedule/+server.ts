import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/core/context.js';
import { addUserAlarm, scheduleOverview } from '#lib/core/schedule.js';
import { serverCtx } from '#lib/server/ctx.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	return Response.json(await scheduleOverview(serverCtx(locals.user.email)));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	try {
		const row = await addUserAlarm(
			serverCtx(locals.user.email),
			await request.json().catch(() => null),
			locals.user.timezone ?? 'UTC'
		);
		return Response.json({ id: row.id }, { status: 201 });
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
};
