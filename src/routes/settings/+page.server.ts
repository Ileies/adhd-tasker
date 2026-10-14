import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { encrypt } from '#lib/server/crypto.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';

export const actions = {
	/** Checks the key with OpenAI, then stores it encrypted. It is never sent back to the client. */
	saveOpenaiKey: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { openaiMessage: 'Sign in first' });

		const key = String((await request.formData()).get('key') ?? '').trim();
		if (!key) return fail(400, { openaiMessage: 'Paste your key first' });

		const check = await fetch('https://api.openai.com/v1/models', {
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(10_000)
		}).catch(() => null);
		if (!check) return fail(502, { openaiMessage: 'Could not reach OpenAI to check the key' });
		if (!check.ok) return fail(400, { openaiMessage: 'OpenAI did not accept this key' });

		await dbRepo(locals.user.email).settings.update({
			openaiKey: encrypt(key, GOOGLE_CLIENT_SECRET, OPENAI_KEY_PURPOSE)
		});
		return { openaiSaved: true };
	},

	removeOpenaiKey: async ({ locals }) => {
		if (!locals.user) return fail(401, { openaiMessage: 'Sign in first' });
		await dbRepo(locals.user.email).settings.update({ openaiKey: null });
		return { openaiRemoved: true };
	},

	/** Forgets the link here. Access is removed for good in the Google account permissions. */
	unlinkGoogle: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Sign in first' });
		await dbRepo(locals.user.email).settings.update({ googleServices: '' });
		return { unlinked: true };
	}
} satisfies Actions;
