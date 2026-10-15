/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { isFullscreenKey, shortcutFor, type KeyPress } from '#lib/shortcuts.js';

const press = (change: Partial<KeyPress> = {}): KeyPress => ({
	key: 'f',
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	repeat: false,
	target: { tagName: 'BODY' },
	...change
});

describe('isFullscreenKey', () => {
	test('F and shift F toggle fullscreen', () => {
		expect(isFullscreenKey(press())).toBe(true);
		expect(isFullscreenKey(press({ key: 'F' }))).toBe(true);
	});

	test('another key does not', () => {
		expect(isFullscreenKey(press({ key: 'g' }))).toBe(false);
	});

	test.each([
		['Ctrl', { ctrlKey: true }],
		['Cmd', { metaKey: true }],
		['Alt', { altKey: true }],
		['a key held down', { repeat: true }]
	])('not with %s', (_, change) => {
		expect(isFullscreenKey(press(change))).toBe(false);
	});

	test.each([
		['an input', { tagName: 'INPUT' }],
		['a text area', { tagName: 'textarea' }],
		['a select', { tagName: 'SELECT' }],
		['editable text', { tagName: 'DIV', isContentEditable: true }]
	])('not while typing in %s', (_, target) => {
		expect(isFullscreenKey(press({ target }))).toBe(false);
	});

	test('works with nothing focused', () => {
		expect(isFullscreenKey(press({ target: null }))).toBe(true);
	});
});

describe('shortcutFor', () => {
	test.each([
		['1', 'now'],
		['2', 'plan'],
		['a', 'assistant'],
		['M', 'mute'],
		['f', 'fullscreen']
	] as const)('%s asks for %s', (key, action) => {
		expect(shortcutFor(press({ key }))).toBe(action);
	});

	test('an unknown key asks for nothing', () => {
		expect(shortcutFor(press({ key: 'x' }))).toBeNull();
	});

	test('not while typing', () => {
		expect(shortcutFor(press({ key: '1', target: { tagName: 'INPUT' } }))).toBeNull();
	});

	test('not with a modifier', () => {
		expect(shortcutFor(press({ key: 'a', ctrlKey: true }))).toBeNull();
	});
});
