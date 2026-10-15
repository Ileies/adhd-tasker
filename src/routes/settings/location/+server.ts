import { error } from '@sveltejs/kit';
import { GeocodeError, searchPlaces } from '#lib/core/geocode.js';
import type { RequestHandler } from './$types';

/** City search for the daylight theme: `?q=Leipzig` answers the matching places. Only the typed name is sent on. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Sign in first');
	try {
		return Response.json(await searchPlaces(url.searchParams.get('q') ?? ''));
	} catch (thrown) {
		if (thrown instanceof GeocodeError) error(thrown.status, thrown.message);
		throw thrown;
	}
};
