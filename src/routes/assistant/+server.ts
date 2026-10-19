import type { RequestHandler } from './$types';
import { parseMessages } from '#lib/core/assistant.js';
import { runAssistant } from '#lib/server/assistant.js';
import { handler } from '#lib/server/route.js';

export const POST: RequestHandler = handler(
	async ({ user, json }) =>
		Response.json(await runAssistant(user.email, parseMessages((await json())?.messages))),
	{ failure: { label: 'Assistant error:', message: 'The assistant failed, try again' } }
);
