/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
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

describe('properties', () => {
	// Not empty: an empty value has no ciphertext part and reads back as nothing, but only keys are stored
	const text = fc.oneof(
		fc.string({ unit: 'grapheme', minLength: 1, maxLength: 200 }),
		fc.string({ unit: 'grapheme-composite', minLength: 1, maxLength: 50 })
	);
	const secret = fc.string({ minLength: 1, maxLength: 40 });

	test('decrypt gives back what encrypt was given, for any text, secret and purpose', () => {
		fc.assert(
			fc.property(text, secret, fc.string({ maxLength: 20 }), (plain, key, purpose) => {
				expect(decrypt(encrypt(plain, key, purpose), key, purpose)).toBe(plain);
			})
		);
	});
});
