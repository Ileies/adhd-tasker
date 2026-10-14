import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { google } from '#lib/server/index.js';

/** Signs this browser out from any page. A failed revoke at Google never keeps the user signed in. */
export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('token');
	if (token) await google.revokeToken(token).catch(() => {});
	cookies.delete('session', { path: '/' });
	cookies.delete('token', { path: '/' });
	redirect(303, '/');
};
