import type { Handle } from '@sveltejs/kit/hooks';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { readSession } from '#lib/server/session.js';
import { startAgent } from '#lib/server/agent.js';
import { building } from '$app/env';

// The build only analyses the app, a timer must not start there
if (!building) startAgent();

export const handle: Handle = async ({ event, resolve }) => {
	console.log(`[${new Date().toISOString()}]:`, event.url.pathname + event.url.search);

	const token = event.cookies.get('token');
	let email = readSession(event.cookies.get('session'));

	if (!email && token) {
		email = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } })).json())?.email;
		if (!email) event.cookies.set('token', '', { path: '/', maxAge: -1 });
	}

	if (email) {
		event.locals.user = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.email, email),
		});
		if (!event.locals.user) {
			[event.locals.user] = await db.insert(users).values({ email }).returning();
		}
	}

	return resolve(event);
};
