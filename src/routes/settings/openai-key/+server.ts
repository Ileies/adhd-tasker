import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { checkOpenaiKey } from '#lib/core/openai-key.js';
import { encrypt } from '#lib/server/crypto.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/ctx.js';
import { handler } from '#lib/server/route.js';
import type { RequestHandler } from './$types';

/** Checks the key with OpenAI, then stores it encrypted. It is never sent back to the client. */
export const PUT: RequestHandler = handler(async ({ ctx, json }) => {
	const body: { key?: unknown } | null = await json();
	const key = await checkOpenaiKey(typeof body?.key === 'string' ? body.key : '');
	await ctx.repo.settings.update({
		openaiKey: encrypt(key, GOOGLE_CLIENT_SECRET, OPENAI_KEY_PURPOSE)
	});
	return Response.json(true);
});

export const DELETE: RequestHandler = handler(async ({ ctx }) => {
	await ctx.repo.settings.update({ openaiKey: null });
	return Response.json(true);
});
