import { type Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

export const handle: Handle = async ({ event, resolve }) => {
	console.log('Handling request:', event.url.pathname + event.url.search);

	const token = event.cookies.get('token');

	if (token) {
		const email: string | undefined = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } })).json())?.email;
		if (email) {
			event.locals.user = await db.query.users.findFirst({
				where: (users, { eq }) => eq(users.email, email),
			});
			if (!event.locals.user) {
				event.locals.user = await db.insert(users).values({ email }).returning();
			}
		} else {
			event.cookies.set('token', '', { path: '/', maxAge: -1 });
		}
	}

	return resolve(event);
};