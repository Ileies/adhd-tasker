/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { rateLimit } from '#lib/core/rate.js';

const limit = () => rateLimit({ requests: 2, windowMs: 1000 }, 'Slow down');

describe('rateLimit', () => {
	test('lets the allowed number through and refuses the next with 429', () => {
		const check = limit();
		check('a', 0);
		check('a', 10);
		expect(() => check('a', 20)).toThrow('Slow down');
		try {
			check('a', 20);
		} catch (error) {
			expect(error).toMatchObject({ status: 429 });
		}
	});

	test('the window slides: old requests stop counting', () => {
		const check = limit();
		check('a', 0);
		check('a', 500);
		expect(() => check('a', 999)).toThrow();
		check('a', 1000);
	});

	test('every key has its own window', () => {
		const check = limit();
		check('a', 0);
		check('a', 0);
		check('b', 0);
	});

	test('a refused request does not count', () => {
		const check = limit();
		check('a', 0);
		check('a', 0);
		expect(() => check('a', 1)).toThrow();
		expect(() => check('a', 2)).toThrow();
		check('a', 1000);
	});
});
