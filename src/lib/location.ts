/**
 * Where the user is, and what that means for the theme: the light window of the day comes from the
 * sun at the saved location, from the main city of the timezone when there is none, from fixed hours
 * when neither is known. Pure, the lookups that find a location are in `core/geocode.ts` and
 * `server/location.ts`.
 */
import type { Settings } from '#lib/core/repo.js';
import { formatClock24 } from '#lib/format.js';
import { placeForTimezone } from '#lib/places.js';
import { FALLBACK_DAY, sunTimes, type DayLight } from '#lib/sun.js';
import { deviceTimezone, type DateKey } from '#lib/time.js';

/** Where a saved location came from: the internet address (account only), the browser's position or a city search. */
export type LocationSource = 'ip' | 'device' | 'city';
/** What the user can set by hand. `ip` is only ever written by the server. */
export type ChosenSource = Exclude<LocationSource, 'ip'>;

export interface Place {
	name: string;
	lat: number;
	lon: number;
}

/** The four settings that make up a location. All set or all `null` (the position is found automatically). */
export type LocationFields = Pick<
	Settings,
	'locationLat' | 'locationLon' | 'locationName' | 'locationSource'
>;

export const LOCATION_KEYS = [
	'locationLat',
	'locationLon',
	'locationName',
	'locationSource'
] as const satisfies readonly (keyof LocationFields)[];

/** The name `Use this device's location` saves, the browser gives a position and no place name. */
export const DEVICE_PLACE_NAME = 'this device';

/** Two decimals are about a kilometer: enough for the sun, too little to find a street. */
export const roundCoord = (value: number) => Math.round(value * 100) / 100;

/** The settings that save `place` as the user's location. */
export function locationFields(place: Place, source: LocationSource): LocationFields {
	return {
		locationLat: roundCoord(place.lat),
		locationLon: roundCoord(place.lon),
		locationName: place.name,
		locationSource: source
	};
}

/** Forgets the saved location, the account finds it again from the internet address. */
export const AUTOMATIC_LOCATION: LocationFields = {
	locationLat: null,
	locationLon: null,
	locationName: null,
	locationSource: null
};

/** The saved location, `null` when there is none (or the four fields do not agree). */
export function savedLocation(fields: LocationFields): (Place & { source: LocationSource }) | null {
	const { locationLat: lat, locationLon: lon, locationName: name, locationSource: source } = fields;
	if (lat === null || lon === null || name === null || source === null) return null;
	return { lat, lon, name, source };
}

/** What the light window is based on. */
export type Basis =
	| { kind: 'location'; name: string; source: LocationSource }
	| { kind: 'timezone'; name: string }
	| { kind: 'none' };

export interface Daylight extends DayLight {
	basis: Basis;
}

/** The light window of a day: the saved location, else the timezone's main city, else the fixed hours. */
export function daylight(fields: LocationFields, timezone: string | null, date: DateKey): Daylight {
	// Without a timezone the clock is the device's own (`minutesNow`), so the window must be too
	const zone = timezone ?? deviceTimezone();
	const saved = savedLocation(fields);
	if (saved) {
		return {
			...sunTimes(saved.lat, saved.lon, date, zone),
			basis: { kind: 'location', name: saved.name, source: saved.source }
		};
	}
	const city = placeForTimezone(timezone);
	if (city) {
		return {
			...sunTimes(city.lat, city.lon, date, zone),
			basis: { kind: 'timezone', name: city.name }
		};
	}
	return { ...FALLBACK_DAY, polar: null, basis: { kind: 'none' } };
}

/** Whether `minutes` is inside the light window. A window that wraps past midnight counts as light on both sides. */
export function isLight({ start, end }: Pick<DayLight, 'start' | 'end'>, minutes: number): boolean {
	return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** The sentence under the theme buttons: the hours and what they are based on. */
export function daylightLine(light: Daylight): string {
	const hours = `${formatClock24(light.start)} to ${formatClock24(light.end)}`;
	const { basis } = light;
	if (light.polar && basis.kind !== 'none') {
		const sun = light.polar === 'day' ? 'does not set' : 'does not rise';
		return `The sun ${sun} today in ${basis.name}. Light from ${hours}.`;
	}
	if (basis.kind === 'location')
		return `Light from ${hours}, based on ${
			basis.source === 'device' ? "this device's location" : basis.name
		}.`;
	if (basis.kind === 'timezone')
		return `Light from ${hours}, based on ${basis.name}, the main city of your timezone.`;
	return `Light from ${hours}. No location is known yet.`;
}
