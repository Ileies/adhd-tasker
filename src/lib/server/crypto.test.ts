/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { decrypt, encrypt } from './crypto';

describe('crypto', () => {
	test('round trips', () => {
		const stored = encrypt('sk-test-123', 'secret');
		expect(stored.startsWith('v1.')).toBe(true);
		expect(stored).not.toContain('sk-test-123');
		expect(decrypt(stored, 'secret')).toBe('sk-test-123');
	});

	test('every encryption differs', () => {
		expect(encrypt('same', 's')).not.toBe(encrypt('same', 's'));
	});

	test('wrong secret, other purpose or tampering give nothing', () => {
		const stored = encrypt('sk-test-123', 'secret', 'openai');
		expect(decrypt(stored, 'other', 'openai')).toBeUndefined();
		expect(decrypt(stored, 'secret', 'other')).toBeUndefined();
		expect(decrypt(stored.slice(0, -2) + 'AA', 'secret', 'openai')).toBeUndefined();
	});

	test('plain text and empty values are not accepted', () => {
		expect(decrypt('sk-plain', 'secret')).toBeUndefined();
		expect(decrypt(null, 'secret')).toBeUndefined();
	});
});
