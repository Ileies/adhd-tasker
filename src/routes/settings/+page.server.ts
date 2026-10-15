import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { revokeGoogle } from '#lib/server/google-tokens.js';

export const actions = {
	/** Tells Google to drop the access, then forgets the token and the linked services here. */
	unlinkGoogle: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Sign in first' });
		const { revoked } = await revokeGoogle(locals.user.email);
		return { unlinked: true, revoked };
	}
} satisfies Actions;
