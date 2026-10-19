import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cancelEntry, setAlarmEnabled, updateUserAlarm } from '#lib/core/schedule.js';
import { handler } from '#lib/server/route.js';

function alarmId(params: { id: string }) {
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'Invalid id');
	return id;
}

/** Turns an alarm on or off: `{ enabled: boolean }`. */
export const PATCH: RequestHandler = handler(async ({ ctx, user, params, json }) => {
	const id = alarmId(params);
	const body = await json();
	if (typeof body?.enabled !== 'boolean') error(400, 'enabled must be true or false');
	if (!(await setAlarmEnabled(ctx, id, body.enabled, user.timezone ?? 'UTC')))
		error(404, 'No such alarm');
	return new Response(null, { status: 204 });
});

/** Changes an alarm: the same body as `POST /schedule`. */
export const PUT: RequestHandler = handler(async ({ ctx, user, params, json }) => {
	const id = alarmId(params);
	if (!(await updateUserAlarm(ctx, id, await json(), user.timezone ?? 'UTC')))
		error(404, 'No such alarm');
	return new Response(null, { status: 204 });
});

/** Cancels one alarm or wakeup. */
export const DELETE: RequestHandler = handler(async ({ ctx, params }) => {
	if (!(await cancelEntry(ctx, alarmId(params)))) error(404, 'No such alarm');
	return new Response(null, { status: 204 });
});
