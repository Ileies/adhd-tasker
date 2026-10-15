import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { google } from '#lib/server/index.js';

/**
 * Deletes the account: the user row, and with it every other row of the user (foreign keys cascade), and signs
 * this browser out. The client gives a ten second window to take it back before it calls this.
 */
export const DELETE: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) error(401, 'Login required');

	const token = cookies.get('token');
	if (token) await google.revokeToken(token).catch(() => {});
	db.delete(users).where(eq(users.email, locals.user.email)).run();
	cookies.delete('session', { path: '/' });
	cookies.delete('token', { path: '/' });
	return new Response(null, { status: 204 });
};
