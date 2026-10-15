/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { muteEnd, MUTE_OPTIONS, restoreMute } from '#lib/mute.js';

describe('muteEnd', () => {
	test('adds the minutes', () => {
		expect(muteEnd(1_000, 60)).toBe(1_000 + 3_600_000);
	});

	test('no minutes means no end', () => {
		expect(muteEnd(1_000, null)).toBeNull();
	});
});

describe('MUTE_OPTIONS', () => {
	test('one hour comes first', () => {
		expect(MUTE_OPTIONS[0].minutes).toBe(60);
	});
});

describe('restoreMute', () => {
	test('unmuted stays unmuted', () => {
		expect(restoreMute(false, 5_000, 1_000)).toEqual({ muted: false, until: null });
	});

	test('a mute without an end stays', () => {
		expect(restoreMute(true, null, 1_000)).toEqual({ muted: true, until: null });
	});

	test('a mute that has not ended stays', () => {
		expect(restoreMute(true, 5_000, 1_000)).toEqual({ muted: true, until: 5_000 });
	});

	test('a mute that ended while the app was closed is over', () => {
		expect(restoreMute(true, 1_000, 1_000)).toEqual({ muted: false, until: null });
	});
});
