import * as arctic from 'arctic';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_REDIRECT_URI } from '$app/env/public';
import { GOOGLE_SERVICES, type GoogleServiceId } from '#lib/google.js';

export const google = new arctic.Google(
	PUBLIC_GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	PUBLIC_REDIRECT_URI
);

/** Plain sign-in, or with `services` an incremental authorization for extra Google services. */
export function login(event: RequestEvent, services: GoogleServiceId[] = []) {
	const state = arctic.generateState();
	const codeVerifier = arctic.generateCodeVerifier();
	const extra = GOOGLE_SERVICES.filter((service) => services.includes(service.id)).map((service) => service.scope);
	const url = google.createAuthorizationURL(state, codeVerifier, ['email', ...extra]);
	if (extra.length) url.searchParams.set('include_granted_scopes', 'true');
	const cookie = { path: '/', secure: !dev, httpOnly: true, maxAge: 60 * 10 }; // 10 minutes

	if (extra.length) event.cookies.set('google_oauth_link', '1', cookie);
	else event.cookies.delete('google_oauth_link', { path: '/' });

	// Store state and code verifier in cookies for callback
	event.cookies.set('google_oauth_state', state, cookie);
	event.cookies.set('google_code_verifier', codeVerifier, cookie);

	redirect(303, url, { external: ['https://accounts.google.com'] });
}
