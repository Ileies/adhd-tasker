import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { RequestHandler } from './$types';
import { google } from '#lib/server/index.js';
import {
	createSession,
	SESSION_MAX_AGE,
	verifyIdToken
} from '#lib/server/session.js';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');

	if (!code || !codeVerifier || state !== storedState) {
		redirect(302, '/error?error=invalid_request');
	}

	try {
		const tokens = await google.validateAuthorizationCode(code, codeVerifier);
		const accessToken = tokens.accessToken();

		cookies.delete('google_oauth_state', { path: '/' });
		cookies.delete('google_code_verifier', { path: '/' });

		cookies.set('token', accessToken, {
			path: '/',
			secure: !dev,
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});
	} catch (error) {
		console.error('OAuth error:', error);
		redirect(302, '/error?auth_failed');
	}
	redirect(302, '/');
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
