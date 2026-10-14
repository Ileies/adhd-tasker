import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { announceDisplay } from '#lib/server/schedule.js';

/** Chooses the device that plays alarms and agent tones, `{ device: string | null }`, null means every device. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const body = await request.json().catch(() => null);
	const device = body?.device;
	if (device !== null && (typeof device !== 'string' || !device || device.length > 64)) error(400, 'Invalid device');

	await db.update(users).set({ displayDevice: device }).where(eq(users.email, locals.user.email));
	await announceDisplay(locals.user.email);
	return new Response(null, { status: 204 });
};
