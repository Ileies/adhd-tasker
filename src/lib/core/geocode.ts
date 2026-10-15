/**
 * City search for the daylight theme, by name, through Open-Meteo's geocoding API (HTTPS, no key). The
 * server runs it for an account, a guest's browser calls it directly, like the OpenAI key check. Only the
 * typed name leaves the page. Named on the Privacy page.
 */
import type { Place } from '#lib/location.js';
import { roundCoord } from '#lib/location.js';

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
/** A search needs at least this many letters, and a longer text is not a city name. */
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;
const RESULTS = 5;

export class GeocodeError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 502
	) {
		super(message);
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** The cities in a geocoding answer, as places named `Leipzig, Germany`. Rows without a position are left out. */
export function parsePlaces(body: unknown): Place[] {
	if (!isRecord(body) || !Array.isArray(body.results)) return [];
	const places: Place[] = [];
	for (const row of body.results) {
		if (!isRecord(row)) continue;
		const { name, latitude, longitude, country } = row;
		if (typeof name !== 'string' || name === '') continue;
		if (typeof latitude !== 'number' || Math.abs(latitude) > 90) continue;
		if (typeof longitude !== 'number' || Math.abs(longitude) > 180) continue;
		places.push({
			name: typeof country === 'string' && country !== '' ? `${name}, ${country}` : name,
			lat: roundCoord(latitude),
			lon: roundCoord(longitude)
		});
	}
	return places.slice(0, RESULTS);
}

/** Cities that match what was typed, best first. Rejects with the reason when the search could not run. */
export async function searchPlaces(query: string, send: typeof fetch = fetch): Promise<Place[]> {
	const name = query.trim();
	if (name.length < SEARCH_MIN || name.length > SEARCH_MAX)
		throw new GeocodeError('Type the name of a city', 400);

	let response: Response;
	try {
		const url = new URL(GEOCODE_URL);
		url.searchParams.set('name', name);
		url.searchParams.set('count', String(RESULTS));
		url.searchParams.set('language', 'en');
		response = await send(url, { signal: AbortSignal.timeout(8000) });
	} catch {
		throw new GeocodeError('Could not reach the city search', 502);
	}
	if (!response.ok) throw new GeocodeError('The city search did not answer', 502);
	return parsePlaces(await response.json().catch(() => null));
}
