import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { revokeGoogle } from '#lib/server/google-tokens.js';
import { google } from '#lib/server/index.js';
import { handler } from '#lib/server/route.js';

/**
 * Deletes the account: the user row, and with it every other row of the user (foreign keys cascade), and signs
 * this browser out. The client gives a ten second window to take it back before it calls this.
 */
export const DELETE: RequestHandler = handler(async ({ user, cookies }) => {
	await revokeGoogle(user.email);
	const token = cookies.get('token');
	if (token) await google.revokeToken(token).catch(() => {});
	db.delete(users).where(eq(users.email, user.email)).run();
	cookies.delete('session', { path: '/' });
	cookies.delete('token', { path: '/' });
	return new Response(null, { status: 204 });
});
