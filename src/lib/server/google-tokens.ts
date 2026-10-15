/**
 * The Google refresh token of a user, kept encrypted in `google_tokens`. Linking stores it, unlinking and deleting
 * the account revoke it at Google first, so the grant is gone there too and not only forgotten here.
 */
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { decrypt, encrypt } from '#lib/server/crypto.js';
import { db } from '#lib/server/db/index.js';
import { googleTokens, users } from '#lib/server/db/schema.js';

export const GOOGLE_TOKEN_PURPOSE = 'google-refresh-token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Keeps the token of this user, replacing an older one (Google issues a new one on every consent). */
export function storeRefreshToken(email: string, token: string, scopes: string[], now: number) {
	const row = {
		refreshToken: encrypt(token, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_PURPOSE),
		scopes: scopes.join(' '),
		createdAt: now
	};
	db.insert(googleTokens)
		.values({ email, ...row })
		.onConflictDoUpdate({ target: googleTokens.email, set: row })
		.run();
}

/** The token as Google gave it, `undefined` when none is stored or it cannot be read (the secret changed). */
export function readRefreshToken(email: string): string | undefined {
	const row = db.select().from(googleTokens).where(eq(googleTokens.email, email)).get();
	return decrypt(row?.refreshToken, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_PURPOSE);
}

export const hasRefreshToken = (email: string) =>
	db.select().from(googleTokens).where(eq(googleTokens.email, email)).get() !== undefined;

/**
 * Tells Google to drop the grant and forgets the token and the linked services. Google being unreachable does not
 * stop the unlink (the user can always remove the app in their Google account), so the answer says what happened.
 */
export async function revokeGoogle(email: string): Promise<{ revoked: boolean }> {
	const token = readRefreshToken(email);
	let revoked = token === undefined;
	if (token !== undefined) {
		try {
			const response = await fetch(REVOKE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ token })
			});
			// Google answers 400 for a token that is already gone, which is what we wanted
			revoked = response.ok || response.status === 400;
		} catch {
			revoked = false;
		}
	}
	db.delete(googleTokens).where(eq(googleTokens.email, email)).run();
	db.update(users).set({ googleServices: '' }).where(eq(users.email, email)).run();
	return { revoked };
}
