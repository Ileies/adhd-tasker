/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { decrypt, encrypt } from '#lib/server/crypto.js';

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
		// Flip the first ciphertext character, replacing it with a fixed one would sometimes change nothing
		const [prefix, iv, tag, data] = stored.split('.');
		const flipped = (data![0] === 'A' ? 'B' : 'A') + data!.slice(1);
		expect(decrypt([prefix, iv, tag, flipped].join('.'), 'secret', 'openai')).toBeUndefined();
	});

	test('plain text and empty values are not accepted', () => {
		expect(decrypt('sk-plain', 'secret')).toBeUndefined();
		expect(decrypt(null, 'secret')).toBeUndefined();
	});
});
