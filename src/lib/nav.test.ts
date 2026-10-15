/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { pageTitle, place } from '#lib/nav.js';

describe('pageTitle', () => {
	test.each([
		['/', null],
		['/edit', 'Plan'],
		['/settings/timezone', 'Settings'],
		['/activity', 'Assistant activity'],
		['/editor', null]
	])('%s is %s', (path, title) => {
		expect(pageTitle(path)).toBe(title);
	});
});

describe('place', () => {
	test('Now and Plan are marked, other pages are neither', () => {
		expect(place('/')).toBe('now');
		expect(place('/edit')).toBe('plan');
		expect(place('/settings')).toBeNull();
	});
});
