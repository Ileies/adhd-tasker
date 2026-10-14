import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 week

function sign(payload: string, secret: string) {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `payload.signature`, the payload is `{ email, exp }` as base64url JSON. */
export function signSession(email: string, secret: string, nowMs: number) {
	const payload = Buffer.from(
		JSON.stringify({ email, exp: nowMs + SESSION_MAX_AGE * 1000 })
	).toString('base64url');
	return `${payload}.${sign(payload, secret)}`;
}

/** Returns the email of a valid, unexpired session cookie value, otherwise undefined. */
export function verifySession(value: string | undefined, secret: string, nowMs: number) {
	const [payload, signature] = value?.split('.') ?? [];
	if (!payload || !signature) return;

	const expected = Buffer.from(sign(payload, secret));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;

	try {
		const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
		if (typeof email === 'string' && typeof exp === 'number' && exp > nowMs) return email;
	} catch {
		return;
	}
}
