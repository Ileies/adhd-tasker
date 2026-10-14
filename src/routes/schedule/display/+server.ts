import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbRepo } from '#lib/server/db-repo.js';
import { announceDisplay } from '#lib/server/schedule.js';

/** Chooses the device that plays alarms and agent tones, `{ device: string | null }`, null means every device. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const body = await request.json().catch(() => null);
	const device = body?.device;
	if (device !== null && (typeof device !== 'string' || !device || device.length > 64))
		error(400, 'Invalid device');

	await dbRepo(locals.user.email).settings.update({ displayDevice: device });
	await announceDisplay(locals.user.email);
	return new Response(null, { status: 204 });
};
