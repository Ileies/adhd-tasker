import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';
import { SESSION_MAX_AGE, signSession, verifySession } from '#lib/server/session-token.js';

export { SESSION_MAX_AGE };

export function createSession(email: string) {
	return signSession(email, GOOGLE_CLIENT_SECRET, Date.now());
}

/** Returns the email of a valid, unexpired session cookie value, otherwise undefined. */
export function readSession(value: string | undefined) {
	return verifySession(value, GOOGLE_CLIENT_SECRET, Date.now());
}

/** Validates a Google Sign-In ID token (One Tap) with Google and returns the verified email. */
export async function verifyIdToken(idToken: string) {
	const res = await fetch(
		`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
	);
	if (!res.ok) return;

	const info = await res.json();
	if (info.aud !== PUBLIC_GOOGLE_CLIENT_ID) return;
	if (info.email_verified !== 'true' && info.email_verified !== true) return;
	return typeof info.email === 'string' ? info.email : undefined;
}
