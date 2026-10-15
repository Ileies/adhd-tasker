import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/core/context.js';
import { cancelEntry, setAlarmEnabled, updateUserAlarm } from '#lib/core/schedule.js';
import { serverCtx } from '#lib/server/ctx.js';

/** Turns an alarm on or off: `{ enabled: boolean }`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'Invalid id');
	const body = await request.json().catch(() => null);
	if (typeof body?.enabled !== 'boolean') error(400, 'enabled must be true or false');
	try {
		const row = await setAlarmEnabled(
			serverCtx(locals.user.email),
			id,
			body.enabled,
			locals.user.timezone ?? 'UTC'
		);
		if (!row) error(404, 'No such alarm');
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
	return new Response(null, { status: 204 });
};

/** Changes an alarm: the same body as `POST /schedule`. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'Invalid id');
	try {
		const row = await updateUserAlarm(
			serverCtx(locals.user.email),
			id,
			await request.json().catch(() => null),
			locals.user.timezone ?? 'UTC'
		);
		if (!row) error(404, 'No such alarm');
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
	return new Response(null, { status: 204 });
};

/** Cancels one alarm or wakeup. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'Invalid id');
	if (!(await cancelEntry(serverCtx(locals.user.email), id))) error(404, 'No such alarm');
	return new Response(null, { status: 204 });
};
