import type { RequestHandler } from './$types';
import { handler } from '#lib/server/route.js';
import { suggestSteps } from '#lib/server/assistant.js';

/** The steps the assistant suggests for an appointment. Nothing is stored, the prep sheet adds what the user keeps. */
export const POST: RequestHandler = handler(
	async ({ user, json }) => Response.json(await suggestSteps(user.email, (await json({})).id)),
	{ failure: { label: 'Prep suggestion error:', message: 'The assistant failed, try again' } }
);
