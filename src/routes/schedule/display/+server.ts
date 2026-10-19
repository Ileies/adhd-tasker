import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handler } from '#lib/server/route.js';
import { announceDisplay } from '#lib/server/schedule.js';

/** Chooses the device that plays alarms and agent tones, `{ device: string | null }`, null means every device. */
export const POST: RequestHandler = handler(async ({ ctx, user, json }) => {
	const device = (await json())?.device;
	if (device !== null && (typeof device !== 'string' || !device || device.length > 64))
		error(400, 'Invalid device');

	await ctx.repo.settings.update({ displayDevice: device });
	await announceDisplay(user.email);
	return new Response(null, { status: 204 });
});
