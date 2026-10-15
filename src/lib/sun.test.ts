/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { FALLBACK_DAY, sunTimes } from '#lib/sun.js';

const clock = (hours: number, minutes: number) => hours * 60 + minutes;

describe('sunTimes', () => {
	// Well known almanac times, the equation is good to a couple of minutes
	test.each([
		[
			'Leipzig at midsummer',
			51.34,
			12.37,
			'2026-06-21',
			'Europe/Berlin',
			clock(4, 53),
			clock(21, 30)
		],
		[
			'Leipzig at midwinter',
			51.34,
			12.37,
			'2026-12-21',
			'Europe/Berlin',
			clock(8, 12),
			clock(16, 4)
		],
		[
			'New York in October',
			40.71,
			-74.01,
			'2026-10-15',
			'America/New_York',
			clock(7, 6),
			clock(18, 16)
		],
		[
			'Sydney in December',
			-33.87,
			151.21,
			'2026-12-21',
			'Australia/Sydney',
			clock(5, 41),
			clock(20, 5)
		]
	])('%s', (_name, lat, lon, date, timezone, sunrise, sunset) => {
		const light = sunTimes(lat, lon, date, timezone);
		expect(light.polar).toBeNull();
		expect(Math.abs(light.start - sunrise)).toBeLessThanOrEqual(3);
		expect(Math.abs(light.end - sunset)).toBeLessThanOrEqual(3);
	});

	test('the days are longer in summer than in winter', () => {
		const summer = sunTimes(51.34, 12.37, '2026-06-21', 'Europe/Berlin');
		const winter = sunTimes(51.34, 12.37, '2026-12-21', 'Europe/Berlin');
		expect(summer.end - summer.start).toBeGreaterThan(winter.end - winter.start);
	});

	test('the other hemisphere has the opposite season', () => {
		const north = sunTimes(51.34, 12.37, '2026-06-21', 'UTC');
		const south = sunTimes(-51.34, 12.37, '2026-06-21', 'UTC');
		expect(south.end - south.start).toBeLessThan(north.end - north.start);
	});

	test('on the equator the day lasts about 12 hours all year', () => {
		for (const date of ['2026-03-20', '2026-06-21', '2026-12-21']) {
			const { start, end } = sunTimes(0, 0, date, 'UTC');
			expect(Math.abs(end - start - clock(12, 7))).toBeLessThanOrEqual(5);
		}
	});

	test('follows daylight saving of the timezone', () => {
		const before = sunTimes(51.34, 12.37, '2026-03-28', 'Europe/Berlin');
		const after = sunTimes(51.34, 12.37, '2026-03-30', 'Europe/Berlin');
		// Sunrise moves about 4 minutes a day, but the clock jumps an hour on the 29th
		expect(after.start - before.start).toBeGreaterThan(40);
	});

	test('polar day answers the fixed hours', () => {
		expect(sunTimes(69.65, 18.96, '2026-06-21', 'Europe/Oslo')).toEqual({
			...FALLBACK_DAY,
			polar: 'day'
		});
	});

	test('polar night answers the fixed hours', () => {
		expect(sunTimes(69.65, 18.96, '2026-12-21', 'Europe/Oslo')).toEqual({
			...FALLBACK_DAY,
			polar: 'night'
		});
	});

	test('the fallback is 07:00 to 19:00', () => {
		expect(FALLBACK_DAY).toEqual({ start: clock(7, 0), end: clock(19, 0) });
	});

	test('the poles do not throw', () => {
		for (const lat of [90, -90]) {
			for (const date of ['2026-03-20', '2026-06-21', '2026-09-23', '2026-12-21'])
				expect(() => sunTimes(lat, 0, date, 'UTC')).not.toThrow();
		}
	});

	test('every answer is a minute of the day', () => {
		for (let lat = -60; lat <= 60; lat += 15) {
			for (let lon = -180; lon <= 180; lon += 45) {
				const { start, end } = sunTimes(lat, lon, '2026-10-15', 'UTC');
				expect(start).toBeGreaterThanOrEqual(0);
				expect(start).toBeLessThan(1440);
				expect(end).toBeGreaterThanOrEqual(0);
				expect(end).toBeLessThan(1440);
			}
		}
	});
});
