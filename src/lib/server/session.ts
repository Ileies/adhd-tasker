import { createHmac, timingSafeEqual } from 'node:crypto';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 week

function sign(payload: string) {
	return createHmac('sha256', GOOGLE_CLIENT_SECRET).update(payload).digest('base64url');
}

export function createSession(email: string) {
	const payload = Buffer.from(
		JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE * 1000 })
	).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

/** Returns the email of a valid, unexpired session cookie value, otherwise undefined. */
export function readSession(value: string | undefined) {
	const [payload, signature] = value?.split('.') ?? [];
	if (!payload || !signature) return;

	const expected = Buffer.from(sign(payload));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;

	try {
		const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
		if (typeof email === 'string' && typeof exp === 'number' && exp > Date.now()) return email;
	} catch {
		return;
	}
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
