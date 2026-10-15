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
		expect(readFlags()).toEqual({ welcomed: false, compactPlan: false });
	});

	test('a set flag stays set', () => {
		setFlag('welcomed');
		expect(readFlags()).toEqual({ welcomed: true, compactPlan: false });
	});

	test('a cleared flag is unset again', () => {
		setFlag('welcomed');
		clearFlag('welcomed');
		expect(readFlags()).toEqual({ welcomed: false, compactPlan: false });
	});

	test('a blocked storage silences the hints', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('blocked');
			}
		});
		expect(readFlags()).toEqual({ welcomed: true, compactPlan: false });
		expect(() => setFlag('welcomed')).not.toThrow();
		expect(() => clearFlag('welcomed')).not.toThrow();
	});
});
