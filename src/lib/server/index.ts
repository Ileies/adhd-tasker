import * as arctic from 'arctic';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_REDIRECT_URI } from '$app/env/public';

export const google = new arctic.Google(
	PUBLIC_GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	PUBLIC_REDIRECT_URI
);

export function login(event: RequestEvent) {
	const state = arctic.generateState();
	const codeVerifier = arctic.generateCodeVerifier();
	const scopes = ['email'];
	const url = google.createAuthorizationURL(state, codeVerifier, scopes);

	// Store state and code verifier in cookies for callback
	event.cookies.set('google_oauth_state', state, {
		path: '/',
		secure: !dev,
		httpOnly: true,
		maxAge: 60 * 10 // 10 minutes
	});

	event.cookies.set('google_code_verifier', codeVerifier, {
		path: '/',
		secure: !dev,
		httpOnly: true,
		maxAge: 60 * 10 // 10 minutes
	});

	redirect(303, url, { external: ['https://accounts.google.com'] });
}
