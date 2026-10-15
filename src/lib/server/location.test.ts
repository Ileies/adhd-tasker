/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { dbRepo } from '#lib/server/db-repo.js';
import {
	IP_LOOKUP_URL,
	RETRY_AFTER_MS,
	clientIp,
	isPublicIp,
	lookupIp,
	parseIpLookup,
	refreshIpLocation,
	resetLocationMemory
} from '#lib/server/location.js';
import { resetDb } from '#test/db.js';
import { fakeFetch } from '#test/fakes.js';
import { TEST_EMAIL, makeUser } from '#test/fixtures.js';

const LEIPZIG_IP = '93.184.216.34';
const answer = (extra: object = {}) =>
	Response.json({
		success: true,
		latitude: 51.33962,
		longitude: 12.37129,
		city: 'Leipzig',
		...extra
	});
const lookupRoute = (ip: string, route: () => Response | Promise<Response> = () => answer()) => ({
	[`${IP_LOOKUP_URL}/${ip}`]: route
});

beforeEach(async () => {
	await resetDb();
	resetLocationMemory();
});

describe('clientIp', () => {
	test('is the first address the proxy forwarded', () => {
		const headers = new Headers({ 'x-forwarded-for': '93.184.216.34, 10.0.0.1' });
		expect(clientIp(headers, '127.0.0.1')).toBe('93.184.216.34');
	});

	test('is the real ip header when nothing was forwarded', () => {
		expect(clientIp(new Headers({ 'x-real-ip': '93.184.216.34' }), '127.0.0.1')).toBe(
			'93.184.216.34'
		);
	});

	test('is the socket address without a proxy', () => {
		expect(clientIp(new Headers(), '93.184.216.34')).toBe('93.184.216.34');
	});

	test('is none when nothing is known', () => {
		expect(clientIp(new Headers())).toBeNull();
	});
});

describe('isPublicIp', () => {
	test.each([
		'93.184.216.34',
		'8.8.8.8',
		'172.32.0.1',
		'2606:2800:220:1:248:1893:25c8:1946',
		'::ffff:93.184.216.34'
	])('%s can be looked up', (ip) => {
		expect(isPublicIp(ip)).toBe(true);
	});

	test.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.20',
		'169.254.1.1',
		'100.64.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'::1',
		'fe80::1',
		'fd12:3456::1',
		'::ffff:192.168.1.1',
		'not an address',
		'1.2.3',
		'300.1.1.1',
		''
	])('%s cannot', (ip) => {
		expect(isPublicIp(ip)).toBe(false);
	});
});

describe('parseIpLookup', () => {
	test('is the city with a position rounded to two decimals', () => {
		expect(
			parseIpLookup({ success: true, latitude: 51.33962, longitude: 12.37129, city: 'Leipzig' })
		).toEqual({ name: 'Leipzig', lat: 51.34, lon: 12.37 });
	});

	test('falls back to the region, then the country, for a place without a city', () => {
		const base = { success: true, latitude: 1, longitude: 2 };
		expect(parseIpLookup({ ...base, city: '', region: 'Saxony', country: 'Germany' })?.name).toBe(
			'Saxony'
		);
		expect(parseIpLookup({ ...base, country: 'Germany' })?.name).toBe('Germany');
		expect(parseIpLookup(base)?.name).toBe('your area');
	});

	test.each([
		['no body', null],
		['a failed lookup', { success: false, latitude: 1, longitude: 2 }],
		['no position', { success: true }],
		['a latitude beyond the poles', { success: true, latitude: 99, longitude: 2 }],
		['a longitude beyond the date line', { success: true, latitude: 1, longitude: 200 }]
	])('%s is no place', (_name, body) => {
		expect(parseIpLookup(body)).toBeNull();
	});
});

describe('lookupIp', () => {
	test('asks the service over https about this address and answers the place', async () => {
		const { requests } = fakeFetch(lookupRoute(LEIPZIG_IP));
		expect(await lookupIp(LEIPZIG_IP)).toEqual({ name: 'Leipzig', lat: 51.34, lon: 12.37 });
		expect(requests[0].url.startsWith('https://')).toBe(true);
		expect(requests[0].url).toContain(`/${LEIPZIG_IP}`);
	});

	test('does not ask about a private address', async () => {
		const { requests } = fakeFetch({});
		expect(await lookupIp('192.168.1.2')).toBeNull();
		expect(requests).toHaveLength(0);
	});

	test('is none when the service fails or cannot be reached', async () => {
		fakeFetch(lookupRoute(LEIPZIG_IP, () => new Response('x', { status: 503 })));
		expect(await lookupIp(LEIPZIG_IP)).toBeNull();
		fakeFetch(
			lookupRoute(LEIPZIG_IP, () => {
				throw new Error('offline');
			})
		);
		expect(await lookupIp(LEIPZIG_IP)).toBeNull();
	});
});

describe('refreshIpLocation', () => {
	test('saves the place for an account without one, and never the address', async () => {
		await makeUser();
		fakeFetch(lookupRoute(LEIPZIG_IP));
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP)).toEqual({
			name: 'Leipzig',
			lat: 51.34,
			lon: 12.37,
			source: 'ip'
		});
		const settings = await dbRepo(TEST_EMAIL).settings.get();
		expect(settings).toMatchObject({
			locationLat: 51.34,
			locationLon: 12.37,
			locationName: 'Leipzig',
			locationSource: 'ip'
		});
		expect(JSON.stringify(settings)).not.toContain(LEIPZIG_IP);
	});

	test('looks up again only when the address changed', async () => {
		await makeUser();
		const { requests } = fakeFetch({
			...lookupRoute(LEIPZIG_IP),
			...lookupRoute('8.8.8.8', () => answer({ city: 'Mountain View' }))
		});
		await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP);
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP)).toBeNull();
		expect(requests).toHaveLength(1);

		await refreshIpLocation(TEST_EMAIL, '8.8.8.8');
		expect(requests).toHaveLength(2);
		expect((await dbRepo(TEST_EMAIL).settings.get()).locationName).toBe('Mountain View');
	});

	test.each(['device', 'city'] as const)('never replaces a place chosen by %s', async (source) => {
		await makeUser({
			locationLat: 35.68,
			locationLon: 139.69,
			locationName: 'Tokyo',
			locationSource: source
		});
		const { requests } = fakeFetch(lookupRoute(LEIPZIG_IP));
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP)).toBeNull();
		expect(requests).toHaveLength(0);
		expect((await dbRepo(TEST_EMAIL).settings.get()).locationName).toBe('Tokyo');
	});

	test('force looks up again even for an address that was seen', async () => {
		await makeUser();
		const { requests } = fakeFetch(lookupRoute(LEIPZIG_IP));
		await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP);
		await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP, { force: true });
		expect(requests).toHaveLength(2);
	});

	test('a failed lookup leaves the location alone and is not retried at once', async () => {
		await makeUser();
		const { requests } = fakeFetch(
			lookupRoute(LEIPZIG_IP, () => new Response('x', { status: 500 }))
		);
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP, { now: 0 })).toBeNull();
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP, { now: RETRY_AFTER_MS - 1 })).toBeNull();
		expect(requests).toHaveLength(1);
		expect((await dbRepo(TEST_EMAIL).settings.get()).locationSource).toBeNull();

		fakeFetch(lookupRoute(LEIPZIG_IP));
		expect(await refreshIpLocation(TEST_EMAIL, LEIPZIG_IP, { now: RETRY_AFTER_MS })).not.toBeNull();
	});

	test('a missing or private address does nothing', async () => {
		await makeUser();
		const { requests } = fakeFetch({});
		expect(await refreshIpLocation(TEST_EMAIL, null)).toBeNull();
		expect(await refreshIpLocation(TEST_EMAIL, '127.0.0.1')).toBeNull();
		expect(requests).toHaveLength(0);
	});
});
