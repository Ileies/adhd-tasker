import { error } from '@sveltejs/kit';
import { GeocodeError, searchPlaces } from '#lib/core/geocode.js';
import { handler } from '#lib/server/route.js';
import type { RequestHandler } from './$types';

/** City search for the daylight theme: `?q=Leipzig` answers the matching places. Only the typed name is sent on. */
export const GET: RequestHandler = handler(async ({ url }) => {
	try {
		return Response.json(await searchPlaces(url.searchParams.get('q') ?? ''));
	} catch (thrown) {
		if (thrown instanceof GeocodeError) error(thrown.status, thrown.message);
		throw thrown;
	}
});
