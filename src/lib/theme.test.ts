/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import type { Backend } from '#lib/backend.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import { AUTOMATIC_LOCATION, locationFields } from '#lib/location.js';
import { clientSettings, type SettingsPatch } from '#lib/settings.js';
import { detectLocation, initPreferences, setLocation, setTheme, syncTheme } from '#lib/theme.js';

const globals = ['localStorage', 'document', 'matchMedia'] as const;
const originals = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

const LEIPZIG = locationFields({ name: 'Leipzig', lat: 51.34, lon: 12.37 }, 'city');
const TROMSO = locationFields({ name: 'Tromso', lat: 69.65, lon: 18.96 }, 'city');

let storage: Record<string, string>;
let dark: Set<string>;
let saved: SettingsPatch[];
let loaded: SettingsPatch;

function install(name: (typeof globals)[number], value: unknown) {
	Object.defineProperty(globalThis, name, { configurable: true, value });
}

/** Berlin wall clock, in summer (UTC+2). */
const summer = (time: string) => setSystemTime(new Date(`2026-06-21T${time}+02:00`));
/** Berlin wall clock, in winter (UTC+1). */
const winter = (time: string) => setSystemTime(new Date(`2026-12-21T${time}+01:00`));

beforeEach(() => {
	storage = {};
	dark = new Set();
	saved = [];
	loaded = {};
	install('localStorage', {
		getItem: (key: string) => storage[key] ?? null,
		setItem: (key: string, value: string) => void (storage[key] = value),
		removeItem: (key: string) => void delete storage[key]
	});
	install('document', {
		documentElement: {
			classList: {
				toggle: (name: string, on: boolean) => void (on ? dark.add(name) : dark.delete(name)),
				contains: (name: string) => dark.has(name)
			}
		}
	});
	install('matchMedia', () => ({ matches: false }));

	tasker.themeMode = 'auto';
	tasker.timezone = 'Europe/Berlin';
	tasker.settings = clientSettings({ ...DEFAULT_SETTINGS, ...LEIPZIG });
	tasker.account = { email: null, ready: true, problem: null };
	tasker.backend = {
		settings: {
			save: async (patch: SettingsPatch) => void saved.push(patch),
			load: async () => ({ ...clientSettings(DEFAULT_SETTINGS), ...loaded })
		}
	} as unknown as Backend;
});

afterEach(() => {
	originals.forEach((original, index) => {
		if (original) Object.defineProperty(globalThis, globals[index], original);
		else Reflect.deleteProperty(globalThis, globals[index]);
	});
});

const isDark = () => dark.has('dark');

describe('the theme by daylight', () => {
	test('is light at noon and dark late at night', () => {
		summer('12:00');
		syncTheme();
		expect(isDark()).toBe(false);
		summer('23:30');
		syncTheme();
		expect(isDark()).toBe(true);
	});

	test('follows the seasons: the same evening hour is light in June and dark in December', () => {
		summer('17:00');
		syncTheme();
		expect(isDark()).toBe(false);
		winter('17:00');
		syncTheme();
		expect(isDark()).toBe(true);
	});

	test('is dark before sunrise and light after it', () => {
		summer('04:00');
		syncTheme();
		expect(isDark()).toBe(true);
		summer('05:30');
		syncTheme();
		expect(isDark()).toBe(false);
	});

	test('always light and always dark ignore the sun', () => {
		summer('12:00');
		setTheme('dark');
		expect(isDark()).toBe(true);
		summer('02:00');
		setTheme('light');
		expect(isDark()).toBe(false);
	});

	test('remembers the chosen mode', () => {
		setTheme('dark');
		expect(storage.theme).toBe('dark');
	});

	test('without a location it follows the main city of the timezone', () => {
		tasker.settings = clientSettings({ ...DEFAULT_SETTINGS });
		summer('12:00');
		syncTheme();
		expect(isDark()).toBe(false);
		summer('23:30');
		syncTheme();
		expect(isDark()).toBe(true);
	});

	test('without a location or a known timezone it uses 07:00 to 19:00', () => {
		tasker.settings = clientSettings({ ...DEFAULT_SETTINGS });
		tasker.timezone = null;
		// With no timezone the clock is the device's own, so the test sets the device's wall clock
		setSystemTime(new Date(2026, 5, 21, 6, 30));
		syncTheme();
		expect(isDark()).toBe(true);
		setSystemTime(new Date(2026, 5, 21, 7, 30));
		syncTheme();
		expect(isDark()).toBe(false);
	});

	test("saves today's light window for the page that loads next", () => {
		summer('12:00');
		syncTheme();
		const [start, end] = storage.daylight.split(',').map(Number);
		expect(start).toBeGreaterThan(4 * 60);
		expect(start).toBeLessThan(5 * 60 + 30);
		expect(end).toBeGreaterThan(21 * 60);
		expect(end).toBeLessThan(22 * 60);
	});

	test('keeps working when the browser blocks storage', () => {
		install('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		});
		summer('23:30');
		const stop = initPreferences();
		expect(isDark()).toBe(true);
		stop();
	});
});

describe('setLocation', () => {
	test('saves the place and the theme follows it at once', async () => {
		summer('20:00');
		syncTheme();
		expect(isDark()).toBe(false);

		// A polar day has no sunset, so the fixed 07:00 to 19:00 apply
		expect(await setLocation(TROMSO)).toBeNull();
		expect(saved).toEqual([TROMSO]);
		expect(tasker.settings).toMatchObject(TROMSO);
		expect(isDark()).toBe(true);
	});

	test('answers the reason and changes nothing when the save failed', async () => {
		summer('20:00');
		syncTheme();
		tasker.backend.settings.save = async () => {
			throw new Error('Invalid value for locationLat');
		};
		expect(await setLocation(TROMSO)).toBe('Invalid value for locationLat');
		expect(tasker.settings.locationName).toBe('Leipzig');
		expect(isDark()).toBe(false);
	});
});

describe('detectLocation', () => {
	test('a guest gives the location back and the timezone stands in for it', async () => {
		expect(await detectLocation()).toBeNull();
		expect(saved).toEqual([AUTOMATIC_LOCATION]);
		expect(tasker.settings.locationSource).toBeNull();
	});

	test('an account takes up the place the server found again', async () => {
		tasker.account = { email: 'ada@example.com', ready: true, problem: null };
		loaded = locationFields({ name: 'Berlin', lat: 52.52, lon: 13.41 }, 'ip');
		expect(await detectLocation()).toBeNull();
		expect(saved).toEqual([AUTOMATIC_LOCATION]);
		expect(tasker.settings).toMatchObject({ locationName: 'Berlin', locationSource: 'ip' });
	});

	test('an account whose server cannot be reached keeps no place', async () => {
		tasker.account = { email: 'ada@example.com', ready: true, problem: null };
		tasker.backend.settings.load = async () => {
			throw new Error('offline');
		};
		expect(await detectLocation()).toBeNull();
		expect(tasker.settings.locationSource).toBeNull();
	});

	test('does not reload when the save failed', async () => {
		tasker.account = { email: 'ada@example.com', ready: true, problem: null };
		tasker.backend.settings.save = async () => {
			throw new Error('No connection');
		};
		expect(await detectLocation()).toBe('No connection');
	});
});

describe('initPreferences', () => {
	test('applies the theme for the time of day and forgets the hours set by hand', () => {
		storage.dayStart = '300';
		storage.dayEnd = '1300';
		storage.theme = 'auto';
		summer('23:30');
		const stop = initPreferences();
		expect(isDark()).toBe(true);
		expect(storage).not.toHaveProperty('dayStart');
		expect(storage).not.toHaveProperty('dayEnd');
		stop();
	});

	test('loads the saved mode', () => {
		storage.theme = 'dark';
		summer('12:00');
		const stop = initPreferences();
		expect(tasker.themeMode).toBe('dark');
		expect(isDark()).toBe(true);
		stop();
	});
});
