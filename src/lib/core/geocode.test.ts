/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { GEOCODE_URL, GeocodeError, parsePlaces, searchPlaces } from '#lib/core/geocode.js';
import { fakeFetch } from '#test/fakes.js';

const leipzig = { name: 'Leipzig', latitude: 51.33962, longitude: 12.37129, country: 'Germany' };

describe('parsePlaces', () => {
	test('names a place after its city and country and rounds the position', () => {
		expect(parsePlaces({ results: [leipzig] })).toEqual([
			{ name: 'Leipzig, Germany', lat: 51.34, lon: 12.37 }
		]);
	});

	test('a place without a country is named after the city', () => {
		expect(parsePlaces({ results: [{ ...leipzig, country: undefined }] })[0].name).toBe('Leipzig');
	});

	test.each([
		['no body', null],
		['no results', {}],
		['results that are not a list', { results: 'x' }],
		['a row without a name', { results: [{ ...leipzig, name: '' }] }],
		['a row without a position', { results: [{ name: 'X' }] }],
		['a latitude beyond the poles', { results: [{ ...leipzig, latitude: 91 }] }],
		['a longitude beyond the date line', { results: [{ ...leipzig, longitude: 181 }] }],
		['a row that is not an object', { results: [7] }]
	])('%s gives no places', (_name, body) => {
		expect(parsePlaces(body)).toEqual([]);
	});

	test('keeps at most five', () => {
		expect(parsePlaces({ results: Array.from({ length: 9 }, () => leipzig) })).toHaveLength(5);
	});
});

describe('searchPlaces', () => {
	test('asks the geocoding service for the typed name and answers the places', async () => {
		const { requests } = fakeFetch({ [GEOCODE_URL]: () => Response.json({ results: [leipzig] }) });
		expect(await searchPlaces('  Leipzig ')).toEqual([
			{ name: 'Leipzig, Germany', lat: 51.34, lon: 12.37 }
		]);
		const url = new URL(requests[0].url);
		expect(url.searchParams.get('name')).toBe('Leipzig');
		expect(url.protocol).toBe('https:');
	});

	test('sends nothing but the name, no cookies and no key', async () => {
		const { requests } = fakeFetch({ [GEOCODE_URL]: () => Response.json({}) });
		await searchPlaces('Leipzig');
		expect([...new URL(requests[0].url).searchParams.keys()].sort()).toEqual([
			'count',
			'language',
			'name'
		]);
		expect(requests[0].headers.get('authorization')).toBeNull();
	});

	test('a city without a match is an empty list', async () => {
		fakeFetch({ [GEOCODE_URL]: () => Response.json({}) });
		expect(await searchPlaces('Nowhereville')).toEqual([]);
	});

	test.each(['', ' ', 'a', 'x'.repeat(81)])('%p is not searched for', async (query) => {
		const { requests } = fakeFetch({});
		expect(await searchPlaces(query).catch((error) => error)).toMatchObject({ status: 400 });
		expect(requests).toHaveLength(0);
	});

	test('a service that answers with an error is a bad gateway', async () => {
		fakeFetch({ [GEOCODE_URL]: () => new Response('no', { status: 500 }) });
		expect(await searchPlaces('Leipzig').catch((error) => error)).toMatchObject({ status: 502 });
	});

	test('a service that cannot be reached is a bad gateway', async () => {
		fakeFetch({
			[GEOCODE_URL]: () => {
				throw new Error('offline');
			}
		});
		const failure = await searchPlaces('Leipzig').catch((error) => error);
		expect(failure).toBeInstanceOf(GeocodeError);
		expect(failure.status).toBe(502);
	});

	test('an answer that is not JSON is an empty list', async () => {
		fakeFetch({ [GEOCODE_URL]: () => new Response('<html>') });
		expect(await searchPlaces('Leipzig')).toEqual([]);
	});
});
