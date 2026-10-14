import { error } from '@sveltejs/kit';
import { parseSettingsPatch } from '#lib/settings.js';
import { dbRepo } from '#lib/server/db-repo.js';
import type { RequestHandler } from './$types';

/** Saves changed settings. The OpenAI key and the timezone have their own, checked paths. */
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Sign in first');

	const parsed = parseSettingsPatch(await request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.error);

	await dbRepo(locals.user.email).settings.update(parsed.value);
	return Response.json(true);
};
