import { error } from '@sveltejs/kit';
import { clientSettings, parseSettingsPatch } from '#lib/settings.js';
import { dbRepo } from '#lib/server/db-repo.js';
import type { RequestHandler } from './$types';

/** The settings the screens show. The OpenAI key itself never leaves the server, only whether one is saved. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in first');
	return Response.json(clientSettings(await dbRepo(locals.user.email).settings.get()));
};

/** Saves changed settings. The OpenAI key and the timezone have their own, checked paths. */
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Sign in first');

	const parsed = parseSettingsPatch(await request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.error);

	await dbRepo(locals.user.email).settings.update(parsed.value);
	return Response.json(true);
};
