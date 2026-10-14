import { error } from '@sveltejs/kit';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { AssistantError } from '#lib/core/context.js';
import { checkOpenaiKey } from '#lib/core/openai-key.js';
import { encrypt } from '#lib/server/crypto.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';
import type { RequestHandler } from './$types';

/** Checks the key with OpenAI, then stores it encrypted. It is never sent back to the client. */
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Sign in first');

	const body: { key?: unknown } | null = await request.json().catch(() => null);
	try {
		const key = await checkOpenaiKey(typeof body?.key === 'string' ? body.key : '');
		await dbRepo(locals.user.email).settings.update({
			openaiKey: encrypt(key, GOOGLE_CLIENT_SECRET, OPENAI_KEY_PURPOSE)
		});
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in first');
	await dbRepo(locals.user.email).settings.update({ openaiKey: null });
	return Response.json(true);
};
