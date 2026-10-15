import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { servicesFromScopes } from '#lib/google.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { storeRefreshToken } from '#lib/server/google-tokens.js';
import { google } from '#lib/server/index.js';
import { createSession, SESSION_MAX_AGE, verifyIdToken } from '#lib/server/session.js';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');
	const linking = cookies.get('google_oauth_link') === '1';

	// The user declined the extra permissions, nothing changes
	if (linking && url.searchParams.get('error') === 'access_denied') {
		cookies.delete('google_oauth_link', { path: '/' });
		redirect(302, '/settings');
	}

	if (!code || !codeVerifier || state !== storedState) {
		redirect(302, '/error?error=invalid_request');
	}

	let linkMismatch = false;
	try {
		const tokens = await google.validateAuthorizationCode(code, codeVerifier);
		const accessToken = tokens.accessToken();

		cookies.delete('google_oauth_state', { path: '/' });
		cookies.delete('google_code_verifier', { path: '/' });
		cookies.delete('google_oauth_link', { path: '/' });

		if (linking) {
			// Only for the signed-in user, and only when it is the same Google account
			const info = await (
				await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
					headers: { Authorization: `Bearer ${accessToken}` }
				})
			).json();
			if (!locals.user || info?.email !== locals.user.email) {
				linkMismatch = true;
			} else {
				const scopes = tokens.hasScopes() ? tokens.scopes() : [];
				const granted = servicesFromScopes(scopes);
				if (tokens.hasRefreshToken())
					storeRefreshToken(locals.user.email, tokens.refreshToken(), scopes, Date.now());
				await db
					.update(users)
					.set({ googleServices: granted.join(' ') })
					.where(eq(users.email, locals.user.email));
			}
		} else {
			cookies.set('token', accessToken, {
				path: '/',
				secure: !dev,
				httpOnly: true,
				maxAge: 60 * 60 * 24 * 7 // 1 week
			});
		}
	} catch (error) {
		console.error('OAuth error:', error);
		redirect(302, '/error?auth_failed');
	}
	if (linkMismatch) redirect(302, '/error?error=invalid_request');
	redirect(302, linking ? '/settings' : '/');
};

// Google One Tap posts the ID token (`credential`) here
export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = await request.formData();
	const credential = form.get('credential');
	const csrfToken = form.get('g_csrf_token');

	// Double submit cookie check required by Google Sign-In
	if (typeof credential !== 'string' || !csrfToken || csrfToken !== cookies.get('g_csrf_token')) {
		redirect(302, '/error?error=invalid_request');
	}

	const email = await verifyIdToken(credential);
	if (!email) redirect(302, '/error?auth_failed');

	cookies.set('session', createSession(email), {
		path: '/',
		secure: !dev,
		httpOnly: true,
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE
	});
	redirect(303, '/');
};
