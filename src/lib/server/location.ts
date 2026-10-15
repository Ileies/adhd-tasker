/**
 * Finds an account's location from its internet address, for the daylight theme. The address goes to an
 * IP geolocation service over HTTPS (named on the Privacy page), only the answer is kept: a position rounded
 * to about a kilometer and the city name, never the address itself. A location the user chose by hand
 * (device or city) is never replaced, only "Detect automatically" in Settings hands it back.
 */
import { roundCoord, type Place } from '#lib/location.js';
import { dbRepo } from '#lib/server/db-repo.js';

export const IP_LOOKUP_URL = 'https://ipwho.is';
/** A lookup that failed is not tried again for this long. */
export const RETRY_AFTER_MS = 10 * 60_000;
const TIMEOUT_MS = 4000;

/**
 * The address of the visitor. Behind the reverse proxy it is the first entry of `X-Forwarded-For`, the
 * socket's own address (what `getClientAddress` answers) is the proxy's. `null` when none is known.
 */
export function clientIp(headers: Headers, socketAddress?: string | null): string | null {
	const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	return forwarded || headers.get('x-real-ip')?.trim() || socketAddress || null;
}

/** Whether a lookup can say anything about the address: not this machine, not a private network. */
export function isPublicIp(ip: string): boolean {
	if (ip.includes(':')) {
		const lower = ip.toLowerCase();
		if (lower === '::1' || lower.startsWith('fe80') || /^f[cd]/.test(lower)) return false;
		return !lower.startsWith('::ffff:') || isPublicIp(lower.slice(7));
	}
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
		return false;
	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 168) return false;
	return !(a === 100 && b >= 64 && b <= 127);
}

/** The place in an IP lookup answer, `null` when the service had none. */
export function parseIpLookup(body: unknown): Place | null {
	if (typeof body !== 'object' || body === null) return null;
	const { success, latitude, longitude, city, region, country } = body as Record<string, unknown>;
	if (success !== true) return null;
	if (typeof latitude !== 'number' || Math.abs(latitude) > 90) return null;
	if (typeof longitude !== 'number' || Math.abs(longitude) > 180) return null;
	const name = [city, region, country].find((part) => typeof part === 'string' && part !== '');
	return {
		name: typeof name === 'string' ? name : 'your area',
		lat: roundCoord(latitude),
		lon: roundCoord(longitude)
	};
}

/** Asks the service where an address is. `null` when it could not tell. */
export async function lookupIp(ip: string): Promise<Place | null> {
	if (!isPublicIp(ip)) return null;
	try {
		const url = `${IP_LOOKUP_URL}/${encodeURIComponent(ip)}?fields=success,latitude,longitude,city,region,country`;
		const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!response.ok) return null;
		return parseIpLookup(await response.json());
	} catch {
		return null;
	}
}

/** The address each account was last looked up for, and when a lookup last failed, in this process. */
const lastIp = new Map<string, string>();
const failedAt = new Map<string, number>();

/** Forgets what was looked up, for tests. */
export function resetLocationMemory() {
	lastIp.clear();
	failedAt.clear();
}

/**
 * Updates the saved location when the address changed since the last visit (or on the first one after a
 * start), unless the user chose a place by hand. Answers the place when it was saved. `force` looks up even
 * when this address was seen, for "Detect automatically".
 */
export async function refreshIpLocation(
	email: string,
	ip: string | null,
	options: { force?: boolean; now?: number } = {}
): Promise<(Place & { source: 'ip' }) | null> {
	if (!ip || !isPublicIp(ip)) return null;
	const now = options.now ?? Date.now();
	if (!options.force) {
		if (lastIp.get(email) === ip) return null;
		if (now - (failedAt.get(email) ?? -Infinity) < RETRY_AFTER_MS) return null;
	}

	const repo = dbRepo(email);
	const { locationSource } = await repo.settings.get();
	if (locationSource === 'device' || locationSource === 'city') {
		lastIp.set(email, ip);
		return null;
	}

	const place = await lookupIp(ip);
	if (!place) {
		failedAt.set(email, now);
		return null;
	}
	lastIp.set(email, ip);
	failedAt.delete(email);
	await repo.settings.update({
		locationLat: place.lat,
		locationLon: place.lon,
		locationName: place.name,
		locationSource: 'ip'
	});
	return { ...place, source: 'ip' };
}
