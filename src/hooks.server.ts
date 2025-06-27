import { type Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { login } from '$lib/server';
import { users } from '$lib/server/db/schema';

export const handle: Handle = async ({ event, resolve }) => {
	console.log('Handling request:', event.url.pathname + event.url.search);

	if (!event.url.pathname.startsWith('/login/callback')) {
		const token = event.cookies.get('token');
		if (!token) login(event);

		const user = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } })).json();
		console.log('User info:', user);

		// Verify token and extract email
		const email = "";

		if (!email) login(event);
		event.locals.user = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.email, email),
		});
		if (!event.locals.user) event.locals.user = await db.insert(users).values({email}).returning();
	}
	return resolve(event);
};