import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { dbRepo } from '#lib/server/db-repo.js';

export const actions = {
	/** Forgets the link here. Access is removed for good in the Google account permissions. */
	unlinkGoogle: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Sign in first' });
		await dbRepo(locals.user.email).settings.update({ googleServices: '' });
		return { unlinked: true };
	}
} satisfies Actions;
