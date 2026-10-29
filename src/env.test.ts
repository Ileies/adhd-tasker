/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { variables } from './env.js';

describe('environment variables', () => {
	test.failing('reads DATA_DIR when the server starts instead of embedding it in the build', () => {
		expect<boolean>(variables.DATA_DIR.static).toBe(false);
	});
});
