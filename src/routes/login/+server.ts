import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isGoogleServiceId } from '#lib/google.js';
import { login } from '#lib/server/index.js';

/**
 * Sends the visitor to Google, from any page. With `services` it asks for those Google services
 * on top of the sign-in. Nothing is stored until Google confirms in /callback.
 */
export const POST: RequestHandler = async (event) => {
	const asked = (await event.request.formData())
		.getAll('services')
		.filter((value) => typeof value === 'string');
	if (asked.length === 0) return login(event);

	if (!event.locals.user) error(401, 'Sign in first');
	const services = asked.filter(isGoogleServiceId);
	if (services.length === 0) error(400, 'Tick at least one service');
	return login(event, services);
};
