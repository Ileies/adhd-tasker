/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { errorCopy } from '#lib/errors.js';

describe('errorCopy', () => {
	test('a missing page offers the way back to Now', () => {
		const copy = errorCopy(404);
		expect(copy.title).toBe('This page does not exist');
		expect(copy.action).toEqual({ label: 'Back to Now', kind: 'home' });
	});

	test.each([500, 502, 503, 400, 403])('status %i is calm and offers Try again', (status) => {
		const copy = errorCopy(status);
		expect(copy.title).toBe('Something went wrong');
		expect(copy.action).toEqual({ label: 'Try again', kind: 'retry' });
	});
});
