/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	DEFAULT_TONE,
	TONE_LIMITS,
	TONE_NAMES,
	parseTone,
	readTone,
	toneLength,
	toneNotes
} from '#lib/tones.js';

describe('the library', () => {
	test('every named tone is valid and within the caps', () => {
		for (const name of TONE_NAMES) {
			const tone = toneNotes(name);
			expect(toneLength(tone)).toBeLessThanOrEqual(TONE_LIMITS.maxMs);
			expect(tone.notes.length).toBeLessThanOrEqual(TONE_LIMITS.maxNotes);
			expect(parseTone(tone).ok).toBe(true);
		}
	});
});

describe('parseTone', () => {
	test('defaults and names', () => {
		expect(parseTone(undefined)).toEqual({ ok: true, value: DEFAULT_TONE, custom: false });
		expect(parseTone('rising')).toEqual({ ok: true, value: 'rising', custom: false });
		expect(parseTone('airhorn').ok).toBe(false);
	});

	test('a custom tone is counted as custom and rounded', () => {
		const result = parseTone({ wave: 'sine', notes: [{ hz: 440.4, ms: 200.2, rest: 50 }] });
		expect(result).toEqual({
			ok: true,
			value: { wave: 'sine', notes: [{ hz: 440, ms: 200, rest: 50 }] },
			custom: true
		});
	});

	test('rejects anything over the safety caps', () => {
		const note = { hz: 440, ms: 400, rest: 100 };
		expect(parseTone({ wave: 'sine', notes: Array(11).fill(note) }).ok).toBe(false); // 5.5 s
		expect(parseTone({ wave: 'sine', notes: Array(13).fill({ hz: 440, ms: 60 }) }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [{ hz: 50, ms: 200 }] }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [{ hz: 5000, ms: 200 }] }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [{ hz: 440, ms: 5000 }] }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [{ hz: 440, ms: 200, rest: 900 }] }).ok).toBe(false);
		expect(parseTone({ wave: 'noise', notes: [{ hz: 440, ms: 200 }] }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [] }).ok).toBe(false);
		expect(parseTone({ wave: 'sine', notes: [{ hz: NaN, ms: 200 }] }).ok).toBe(false);
	});

	test('exactly 5 seconds is allowed', () => {
		expect(parseTone({ wave: 'sine', notes: Array(10).fill({ hz: 440, ms: 500 }) }).ok).toBe(true);
	});
});

describe('readTone', () => {
	test('falls back to the default for broken stored data', () => {
		expect(readTone('nope')).toBe(DEFAULT_TONE);
		expect(readTone(null)).toBe(DEFAULT_TONE);
		expect(readTone('soft')).toBe('soft');
	});
});

describe('properties', () => {
	const number = fc.oneof(
		fc.integer({ min: -100, max: 4000 }),
		fc.double({ min: -100, max: 4000, noNaN: true })
	);
	const note = fc.record(
		{ hz: number, ms: number, rest: fc.oneof(number, fc.constant(undefined)) },
		{ requiredKeys: ['hz', 'ms'] }
	);
	const custom = fc.record({
		wave: fc.oneof(fc.constantFrom('sine', 'triangle', 'square', 'sawtooth'), fc.string()),
		notes: fc.array(note, { maxLength: 16 })
	});

	test('anything accepted is within the caps', () => {
		fc.assert(
			fc.property(custom, (value) => {
				const parsed = parseTone(value);
				if (!parsed.ok || typeof parsed.value === 'string') return;
				const { notes } = parsed.value;
				expect(notes.length).toBeGreaterThanOrEqual(1);
				expect(notes.length).toBeLessThanOrEqual(TONE_LIMITS.maxNotes);
				for (const { hz, ms, rest = 0 } of notes) {
					expect(hz).toBeGreaterThanOrEqual(TONE_LIMITS.minHz);
					expect(hz).toBeLessThanOrEqual(TONE_LIMITS.maxHz);
					expect(ms).toBeGreaterThanOrEqual(TONE_LIMITS.minNoteMs);
					expect(ms).toBeLessThanOrEqual(TONE_LIMITS.maxNoteMs);
					expect(rest).toBeGreaterThanOrEqual(0);
					expect(rest).toBeLessThanOrEqual(TONE_LIMITS.maxRestMs);
				}
				expect(toneLength(parsed.value)).toBeLessThanOrEqual(TONE_LIMITS.maxMs);
			})
		);
	});

	test('arbitrary JSON never throws and always reads back as a playable tone', () => {
		fc.assert(
			fc.property(fc.jsonValue(), (value) => {
				const tone = readTone(value);
				expect(toneLength(toneNotes(tone))).toBeLessThanOrEqual(TONE_LIMITS.maxMs);
			})
		);
	});
});
