/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
// eslint-disable-next-line no-restricted-imports -- SvelteKit's env entry point is outside #lib.
import { variables } from './env.js';

describe('environment variables', () => {
	test('reads DATA_DIR when the server starts instead of embedding it in the build', () => {
		expect<boolean>(variables.DATA_DIR.static).toBe(false);
	});

	test('preserves the configured data directory', async () => {
		expect(await variables.DATA_DIR.schema['~standard'].validate('/var/lib/tasker data')).toEqual({
			value: '/var/lib/tasker data'
		});
	});

	test.each([undefined, ''])('defaults DATA_DIR to data when it is %p', async (value) => {
		expect(await variables.DATA_DIR.schema['~standard'].validate(value)).toEqual({ value: 'data' });
	});
});
