/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
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
