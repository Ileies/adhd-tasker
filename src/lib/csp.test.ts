/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { CSP_DIRECTIVES } from '#lib/csp.js';

const sources = (directive: keyof typeof CSP_DIRECTIVES): readonly string[] =>
	CSP_DIRECTIVES[directive];

describe('CSP_DIRECTIVES', () => {
	test('a script that got into the page can only send data to this origin, OpenAI, Google sign in and the city search', () => {
		expect(sources('connect-src')).toEqual([
			'self',
			'https://api.openai.com',
			'wss://api.openai.com',
			'https://accounts.google.com',
			'https://geocoding-api.open-meteo.com'
		]);
	});

	test.each(Object.entries(CSP_DIRECTIVES))('%s has no wildcard source', (_name, list) => {
		for (const source of list as readonly string[]) {
			expect(source).not.toBe('*');
			expect(source).not.toBe('https:');
			expect(source).not.toBe('http:');
			expect(source).not.toContain('*');
		}
	});

	test('scripts are never inline or eval, SvelteKit adds nonces to its own', () => {
		const scripts = sources('script-src');
		expect(scripts).not.toContain('unsafe-inline');
		expect(scripts).not.toContain('unsafe-eval');
		expect(scripts).toEqual(['self', 'https://accounts.google.com']);
	});

	test('plugins are off and the base and form targets are pinned', () => {
		expect(sources('object-src')).toEqual(['none']);
		expect(sources('base-uri')).toEqual(['self']);
		expect(sources('form-action')).toEqual(['self', 'https://accounts.google.com']);
	});

	test('everything else falls back to this origin', () => {
		expect(sources('default-src')).toEqual(['self']);
	});
});
