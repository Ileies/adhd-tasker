/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { SESSION_MAX_AGE, signSession, verifySession } from '#lib/server/session-token.js';

const SECRET = 'secret-a';
const NOW = Date.parse('2026-10-14T08:00:00Z');
const WEEK_MS = SESSION_MAX_AGE * 1000;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('signSession and verifySession', () => {
	test('a fresh session returns its email', () => {
		const value = signSession('me@test', SECRET, NOW);
		expect(verifySession(value, SECRET, NOW)).toBe('me@test');
	});

	test('a session is valid for a week, end exclusive', () => {
		const value = signSession('me@test', SECRET, NOW);
		expect(verifySession(value, SECRET, NOW + WEEK_MS - 1)).toBe('me@test');
		expect(verifySession(value, SECRET, NOW + WEEK_MS)).toBeUndefined();
	});

	test('another secret does not verify', () => {
		expect(verifySession(signSession('me@test', SECRET, NOW), 'secret-b', NOW)).toBeUndefined();
	});

	test('a changed payload does not verify', () => {
		const [, signature] = signSession('me@test', SECRET, NOW).split('.');
		const forged = encode({ email: 'admin@test', exp: NOW + WEEK_MS });
		expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeUndefined();
	});

	test('a changed signature does not verify', () => {
		const [payload, signature] = signSession('me@test', SECRET, NOW).split('.');
		const flipped = (signature![0] === 'A' ? 'B' : 'A') + signature!.slice(1);
		expect(verifySession(`${payload}.${flipped}`, SECRET, NOW)).toBeUndefined();
	});

	test('a signature of the wrong length does not verify and does not throw', () => {
		const [payload, signature] = signSession('me@test', SECRET, NOW).split('.');
		expect(verifySession(`${payload}.${signature!.slice(1)}`, SECRET, NOW)).toBeUndefined();
		expect(verifySession(`${payload}.${signature}xx`, SECRET, NOW)).toBeUndefined();
	});

	test.each([[undefined], [''], ['no-dot'], ['.sig'], ['payload.']])(
		'missing parts (%p) mean no session',
		(value) => {
			expect(verifySession(value, SECRET, NOW)).toBeUndefined();
		}
	);
});

describe('verifySession with a correctly signed but odd payload', () => {
	/** Signs an arbitrary payload string with the same algorithm, as only the server could. */
	const signed = (payload: string) =>
		`${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

	test('a payload that is not JSON', () => {
		const value = signed(Buffer.from('not json').toString('base64url'));
		expect(verifySession(value, SECRET, NOW)).toBeUndefined();
	});

	test('an email that is not a string', () => {
		const value = signed(encode({ email: 42, exp: NOW + WEEK_MS }));
		expect(verifySession(value, SECRET, NOW)).toBeUndefined();
	});

	test('an expiry that is not a number', () => {
		const value = signed(encode({ email: 'me@test', exp: String(NOW + WEEK_MS) }));
		expect(verifySession(value, SECRET, NOW)).toBeUndefined();
	});

	test('a payload without an expiry', () => {
		const value = signed(encode({ email: 'me@test' }));
		expect(verifySession(value, SECRET, NOW)).toBeUndefined();
	});
});
