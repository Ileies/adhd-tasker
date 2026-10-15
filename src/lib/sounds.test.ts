/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	SOUND_LIMITS,
	SOUND_SLOTS,
	SOUND_TEXT,
	checkSoundFile,
	checkSoundLength,
	isSoundSlot,
	shortFileName
} from '#lib/sounds.js';

describe('sound slots', () => {
	test('every slot has a label and a hint', () => {
		for (const slot of SOUND_SLOTS) {
			expect(SOUND_TEXT[slot].label.length).toBeGreaterThan(0);
			expect(SOUND_TEXT[slot].hint.length).toBeGreaterThan(0);
		}
	});

	test.each([
		['done', true],
		['task-started', true],
		['alarm', true],
		['chime', false],
		[undefined, false]
	])('%p is a slot: %p', (value, expected) => {
		expect(isSoundSlot(value)).toBe(expected);
	});
});

describe('checkSoundFile', () => {
	test.each([
		[{ type: 'audio/mpeg', size: 1000 }, null],
		[{ type: '', size: 1000 }, null],
		[{ type: 'audio/wav', size: SOUND_LIMITS.maxBytes }, null],
		[{ type: 'audio/wav', size: 0 }, 'That file is empty.'],
		[{ type: 'image/png', size: 1000 }, 'Pick an audio file (mp3, wav, ogg, m4a).'],
		[
			{ type: 'audio/wav', size: SOUND_LIMITS.maxBytes + 1 },
			'That file is too large. Keep it under 1 MB.'
		]
	])('%p gives %p', (file, expected) => {
		expect(checkSoundFile(file)).toBe(expected);
	});
});

describe('checkSoundLength', () => {
	test('a sound up to the cap is kept', () => {
		expect(checkSoundLength(5)).toBeNull();
		expect(checkSoundLength(0.2)).toBeNull();
	});

	test('a longer sound is refused with the limit in words', () => {
		expect(checkSoundLength(5.01)).toBe('That sound is too long. Keep it under 5 seconds.');
	});

	test.each([0, -1, NaN, Infinity])('%p seconds is refused', (seconds) => {
		expect(checkSoundLength(seconds)).toBe('That sound has no length.');
	});

	test('an alarm may be 15 seconds, other sounds stay at 5', () => {
		expect(checkSoundLength(15, 'alarm')).toBeNull();
		expect(checkSoundLength(15.01, 'alarm')).toBe(
			'That sound is too long. Keep it under 15 seconds.'
		);
		expect(checkSoundLength(6, 'done')).toBe('That sound is too long. Keep it under 5 seconds.');
	});

	test('an alarm file may be larger than another sound file', () => {
		const size = SOUND_LIMITS.maxBytes + 1;
		expect(checkSoundFile({ type: 'audio/wav', size }, 'alarm')).toBeNull();
		expect(checkSoundFile({ type: 'audio/wav', size }, 'done')).not.toBeNull();
		expect(checkSoundFile({ type: 'audio/wav', size: 3_000_001 }, 'alarm')).toBe(
			'That file is too large. Keep it under 3 MB.'
		);
	});
});

describe('shortFileName', () => {
	test('drops the path and shortens a long name', () => {
		expect(shortFileName('C:\\sounds\\bell.mp3')).toBe('bell.mp3');
		expect(shortFileName('a/b/ding.wav')).toBe('ding.wav');
		expect(shortFileName('x'.repeat(60))).toHaveLength(40);
		expect(shortFileName('')).toBe('Your sound');
	});
});
