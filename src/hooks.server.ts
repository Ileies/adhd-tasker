import type { Handle } from '@sveltejs/kit/hooks';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { readSession } from '#lib/server/session.js';
import { startAgent } from '#lib/server/agent.js';
import { clientIp, refreshIpLocation } from '#lib/server/location.js';
import { SHELL_GUEST, SHELL_HEADER } from '#lib/offline.js';
import { building } from '$app/env';

// The build only analyses the app, a timer must not start there
if (!building) startAgent();

/** How long the first page waits for the lookup that places a new account for the theme. */
const LOCATION_WAIT_MS = 1500;

/**
 * Looks up where the account is when its internet address changed (the theme follows the sun there). Only the
 * first visit without any location waits for the answer, a short while, so its first page already has the right
 * light. Every other visit goes on at once and the next one sees the new place. Never fails a request.
 */
async function findLocation(
	event: Parameters<Handle>[0]['event'],
	user: typeof users.$inferSelect
) {
	try {
		const lookup = refreshIpLocation(
			user.email,
			clientIp(event.request.headers, event.getClientAddress())
		).catch(() => null);
		if (user.locationSource !== null) return;
		const place = await Promise.race([
			lookup,
			new Promise<null>((resolve) => setTimeout(resolve, LOCATION_WAIT_MS, null))
		]);
		if (place)
			Object.assign(user, {
				locationLat: place.lat,
				locationLon: place.lon,
				locationName: place.name,
				locationSource: place.source
			});
	} catch (error) {
		console.error('[location] lookup failed', error);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	console.log(`[${new Date().toISOString()}]:`, event.url.pathname + event.url.search);

	const token = event.cookies.get('token');
	let email = readSession(event.cookies.get('session'));

	if (!email && token) {
		try {
			const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
				headers: { Authorization: `Bearer ${token}` }
			});
			email = (await response.json())?.email;
			if (!email) event.cookies.set('token', '', { path: '/', maxAge: -1 });
		} catch (error) {
			// Google not reachable: this visit is logged out, the token stays for the next one
			console.error('[auth] userinfo failed', error);
		}
	}

	if (email) {
		event.locals.user = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.email, email)
		});
		if (!event.locals.user) {
			// The column default of an older database is an older list of events, the app's own default is what counts
			[event.locals.user] = await db
				.insert(users)
				.values({ email, aiEvents: DEFAULT_SETTINGS.aiEvents })
				.returning();
		}
		await findLocation(event, event.locals.user);
	}

	const response = await resolve(event);
	// Tells the service worker this page holds no plan, so it may keep it for offline use
	if (!event.locals.user) response.headers.set(SHELL_HEADER, SHELL_GUEST);
	return response;
};
