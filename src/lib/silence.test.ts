/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { silenceLine, type SoundState } from '#lib/silence.js';

const sound = (overrides: Partial<SoundState> = {}): SoundState => ({
	muted: false,
	volume: 80,
	blocked: false,
	plays: true,
	...overrides
});

describe('silenceLine', () => {
	test('working sound says nothing', () => {
		expect(silenceLine(sound())).toBeNull();
	});

	test('muted says sound is off', () => {
		expect(silenceLine(sound({ muted: true }))).toBe('Sound off');
	});

	test('volume at zero says sound is off', () => {
		expect(silenceLine(sound({ volume: 0 }))).toBe('Sound off');
	});

	test('blocked audio says how to turn it on', () => {
		expect(silenceLine(sound({ blocked: true }))).toBe('Tap anywhere to turn sound on');
	});

	test('muted wins over blocked, a tap would not help', () => {
		expect(silenceLine(sound({ muted: true, blocked: true }))).toBe('Sound off');
	});

	test('a device that is not the display device stays quiet on purpose and says nothing', () => {
		expect(silenceLine(sound({ plays: false, muted: true, blocked: true }))).toBeNull();
	});
});
