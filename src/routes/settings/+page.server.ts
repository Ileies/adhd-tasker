import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { isGoogleServiceId } from '#lib/google.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { login } from '#lib/server/index.js';

export const actions = {
	/** Asks Google for the ticked services on top of the sign-in. Nothing is stored until Google confirms in /callback. */
	linkGoogle: async (event) => {
		if (!event.locals.user) return fail(401, { message: 'Sign in first' });

		const services = (await event.request.formData()).getAll('service').filter((value) => typeof value === 'string').filter(isGoogleServiceId);
		if (services.length === 0) return fail(400, { message: 'Tick at least one service' });

		login(event, services);
	},

	/** Forgets the link here. Access is removed for good in the Google account permissions. */
	unlinkGoogle: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Sign in first' });
		await db.update(users).set({ googleServices: '' }).where(eq(users.email, locals.user.email));
		return { unlinked: true };
	}
} satisfies Actions;
