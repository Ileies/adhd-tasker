/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	GOOGLE_SERVICES,
	isGoogleServiceId,
	parseServices,
	servicesFromScopes
} from '#lib/google.js';

describe('isGoogleServiceId', () => {
	test('knows the listed services only', () => {
		for (const service of GOOGLE_SERVICES) expect(isGoogleServiceId(service.id)).toBe(true);
		expect(isGoogleServiceId('drive')).toBe(false);
		expect(isGoogleServiceId('')).toBe(false);
	});
});

describe('servicesFromScopes', () => {
	test('maps granted scopes to services and ignores unknown scopes', () => {
		expect(
			servicesFromScopes([
				'openid',
				'https://www.googleapis.com/auth/calendar.events',
				'https://www.googleapis.com/auth/drive'
			])
		).toEqual(['calendar']);
	});

	test('nothing granted means no services', () => {
		expect(servicesFromScopes([])).toEqual([]);
	});

	test('the order follows the service list, not the scopes', () => {
		const [tasks, calendar] = GOOGLE_SERVICES;
		expect(servicesFromScopes([calendar.scope, tasks.scope])).toEqual(['tasks', 'calendar']);
	});
});

describe('parseServices', () => {
	test('reads the space separated column', () => {
		expect(parseServices('tasks calendar')).toEqual(['tasks', 'calendar']);
	});

	test.each([[null], [undefined], [''], ['   '], ['junk other']])(
		'%p means no services',
		(stored) => {
			expect(parseServices(stored)).toEqual([]);
		}
	);

	test('drops unknown entries and keeps the rest', () => {
		expect(parseServices('tasks junk keep')).toEqual(['tasks', 'keep']);
	});
});
