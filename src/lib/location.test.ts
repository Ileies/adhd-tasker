/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import {
	AUTOMATIC_LOCATION,
	daylight,
	daylightLine,
	isLight,
	locationFields,
	roundCoord,
	savedLocation,
	type LocationFields
} from '#lib/location.js';
import { FALLBACK_DAY } from '#lib/sun.js';

const LEIPZIG = { name: 'Leipzig', lat: 51.34, lon: 12.37 };
const leipzig = (source: 'ip' | 'device' | 'city' = 'city'): LocationFields =>
	locationFields(LEIPZIG, source);

describe('roundCoord', () => {
	test.each([
		[51.339, 51.34],
		[-0.004, -0],
		[12.375, 12.38],
		[7, 7]
	])('%f becomes %f', (value, expected) => {
		expect(roundCoord(value)).toBe(expected);
	});
});

describe('locationFields', () => {
	test('rounds the position to about a kilometer and keeps the name and source', () => {
		expect(locationFields({ name: 'Leipzig', lat: 51.33962, lon: 12.37129 }, 'device')).toEqual({
			locationLat: 51.34,
			locationLon: 12.37,
			locationName: 'Leipzig',
			locationSource: 'device'
		});
	});
});

describe('savedLocation', () => {
	test('is the place the four settings describe', () => {
		expect(savedLocation(leipzig('ip'))).toEqual({ ...LEIPZIG, source: 'ip' });
	});

	test('is none when the settings are cleared', () => {
		expect(savedLocation(AUTOMATIC_LOCATION)).toBeNull();
	});

	test('is none when one of the four is missing', () => {
		expect(savedLocation({ ...leipzig(), locationName: null })).toBeNull();
	});
});

describe('daylight', () => {
	test('follows the sun at the saved location', () => {
		const light = daylight(leipzig(), 'Europe/Berlin', '2026-06-21');
		expect(light.basis).toEqual({ kind: 'location', name: 'Leipzig', source: 'city' });
		expect(light.start).toBeLessThan(5 * 60);
		expect(light.end).toBeGreaterThan(21 * 60);
	});

	test('the same place has a shorter day in winter', () => {
		const summer = daylight(leipzig(), 'Europe/Berlin', '2026-06-21');
		const winter = daylight(leipzig(), 'Europe/Berlin', '2026-12-21');
		expect(winter.end - winter.start).toBeLessThan(summer.end - summer.start);
	});

	test('without a location it follows the main city of the timezone', () => {
		const light = daylight(DEFAULT_SETTINGS, 'Europe/Berlin', '2026-06-21');
		expect(light.basis).toEqual({ kind: 'timezone', name: 'Berlin' });
		expect(light.start).toBeLessThan(5 * 60 + 30);
	});

	test('a saved location wins over the timezone', () => {
		const tokyo = locationFields({ name: 'Tokyo', lat: 35.68, lon: 139.69 }, 'city');
		const light = daylight(tokyo, 'Europe/Berlin', '2026-06-21');
		expect(light.basis.kind).toBe('location');
	});

	test('without a location or a known timezone it is the fixed 07:00 to 19:00', () => {
		expect(daylight(DEFAULT_SETTINGS, null, '2026-06-21')).toEqual({
			...FALLBACK_DAY,
			polar: null,
			basis: { kind: 'none' }
		});
		expect(daylight(DEFAULT_SETTINGS, 'Mars/Olympus', '2026-06-21').basis).toEqual({
			kind: 'none'
		});
	});

	test('a polar night keeps the fixed hours and says where it is', () => {
		const tromso = locationFields({ name: 'Tromso', lat: 69.65, lon: 18.96 }, 'city');
		const light = daylight(tromso, 'Europe/Oslo', '2026-12-21');
		expect(light).toMatchObject({ ...FALLBACK_DAY, polar: 'night' });
	});
});

describe('isLight', () => {
	const day = { start: 7 * 60, end: 19 * 60 };

	test.each([
		[6 * 60 + 59, false],
		[7 * 60, true],
		[18 * 60 + 59, true],
		[19 * 60, false],
		[0, false]
	])('minute %d is light: %s', (minutes, expected) => {
		expect(isLight(day, minutes)).toBe(expected);
	});

	test('a window that wraps past midnight is light on both sides of it', () => {
		const wrapped = { start: 22 * 60, end: 5 * 60 };
		expect(isLight(wrapped, 23 * 60)).toBe(true);
		expect(isLight(wrapped, 60)).toBe(true);
		expect(isLight(wrapped, 12 * 60)).toBe(false);
	});
});

describe('daylightLine', () => {
	const line = (fields: LocationFields, timezone: string | null, date = '2026-12-21') =>
		daylightLine(daylight(fields, timezone, date));

	test('names the hours and the place', () => {
		expect(line(leipzig(), 'Europe/Berlin')).toMatch(
			/^Light from 08:1\d to 16:0\d, based on Leipzig\.$/
		);
	});

	test('a position from the device has no city to name', () => {
		const device = locationFields({ name: 'this device', lat: 51.34, lon: 12.37 }, 'device');
		expect(line(device, 'Europe/Berlin')).toContain("based on this device's location");
	});

	test('says when the timezone stands in for a location', () => {
		expect(line(DEFAULT_SETTINGS, 'Europe/Berlin')).toContain(
			'based on Berlin, the main city of your timezone'
		);
	});

	test('says when nothing is known', () => {
		expect(line(DEFAULT_SETTINGS, null)).toBe(
			'Light from 07:00 to 19:00. No location is known yet.'
		);
	});

	test('says why the hours are fixed in a polar night', () => {
		const tromso = locationFields({ name: 'Tromso', lat: 69.65, lon: 18.96 }, 'city');
		expect(line(tromso, 'Europe/Oslo')).toBe(
			'The sun does not rise today in Tromso. Light from 07:00 to 19:00.'
		);
	});
});
