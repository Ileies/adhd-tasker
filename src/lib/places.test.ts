/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { placeForTimezone } from '#lib/places.js';
import { isValidTimezone } from '#lib/time.js';

describe('placeForTimezone', () => {
	test('is the main city of a known zone', () => {
		expect(placeForTimezone('Europe/Berlin')?.name).toBe('Berlin');
	});

	test.each([null, undefined, '', 'Nowhere/Land'])('is none for %p', (zone) => {
		expect(placeForTimezone(zone)).toBeNull();
	});

	test('every listed zone is a real timezone with a position on earth', () => {
		const zones = Intl.supportedValuesOf('timeZone');
		for (const zone of [...zones, 'Asia/Calcutta']) {
			const place = placeForTimezone(zone);
			if (!place) continue;
			expect(isValidTimezone(zone)).toBe(true);
			expect(Math.abs(place.lat)).toBeLessThanOrEqual(90);
			expect(Math.abs(place.lon)).toBeLessThanOrEqual(180);
		}
	});

	test('the common zones are covered', () => {
		for (const zone of ['Europe/London', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney'])
			expect(placeForTimezone(zone)).not.toBeNull();
	});
});
