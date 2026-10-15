/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { clearFlag, readFlags, setFlag } from '#lib/flags.js';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function fakeStorage(values: Record<string, string> = {}) {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => values[key] ?? null,
			setItem: (key: string, value: string) => void (values[key] = value),
			removeItem: (key: string) => void delete values[key]
		}
	});
	return values;
}

beforeEach(() => void fakeStorage());
afterEach(() => {
	if (original) Object.defineProperty(globalThis, 'localStorage', original);
	else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('flags', () => {
	test('start unset', () => {
		expect(readFlags()).toEqual({ welcomed: false, screenHintSeen: false });
	});

	test('a set flag stays set and the others are not touched', () => {
		setFlag('welcomed');
		expect(readFlags()).toEqual({ welcomed: true, screenHintSeen: false });
	});

	test('a cleared flag is unset again, the others stay', () => {
		setFlag('screenHintSeen');
		setFlag('welcomed');
		clearFlag('screenHintSeen');
		expect(readFlags()).toEqual({ welcomed: true, screenHintSeen: false });
	});

	test('a blocked storage silences the hints', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('blocked');
			}
		});
		expect(readFlags()).toEqual({ welcomed: true, screenHintSeen: true });
		expect(() => setFlag('welcomed')).not.toThrow();
		expect(() => clearFlag('welcomed')).not.toThrow();
	});
});
