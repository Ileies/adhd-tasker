import { flushSync } from 'svelte';
import { tasker, type ThemeMode } from '#lib/app.svelte.js';
import { saveSettings } from '#lib/autosave.js';
import {
	AUTOMATIC_LOCATION,
	LOCATION_KEYS,
	daylight,
	isLight,
	type LocationFields
} from '#lib/location.js';
import { minutesNow, todayIn } from '#lib/time.js';
import { muteEnd, restoreMute } from '#lib/mute.js';

function save(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage can be blocked, the setting then only lasts for this page
	}
}

/** The light window of today where the user is. Today's, so it follows the seasons without anyone setting hours. */
function todaysDaylight(at = new Date()) {
	return daylight(tasker.settings, tasker.timezone, todayIn(tasker.timezone, at));
}

function resolveDark(): boolean {
	// Before the settings arrive the location and timezone are unknown: keep what app.html painted from the
	// last saved window, and do not overwrite that window with a guess
	if (tasker.themeMode === 'auto' && !tasker.account.ready)
		return document.documentElement.classList.contains('dark');
	const light = todaysDaylight();
	// app.html has no sun math: it reads today's window from here before the app loads
	save('daylight', `${light.start},${light.end}`);
	if (tasker.themeMode !== 'auto') return tasker.themeMode === 'dark';
	return !isLight(light, minutesNow(tasker.timezone));
}

function applyDark(dark: boolean) {
	document.documentElement.classList.toggle('dark', dark);
}

/** Re-evaluates the theme and cross-fades the page if it changed. */
export function syncTheme() {
	const dark = resolveDark();
	if (dark === document.documentElement.classList.contains('dark')) return;

	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!document.startViewTransition || reduceMotion) {
		applyDark(dark);
		return;
	}
	document.startViewTransition(() => flushSync(() => applyDark(dark)));
}

export function setTheme(mode: ThemeMode) {
	tasker.themeMode = mode;
	save('theme', mode);
	syncTheme();
}

/** Saves where the user is (a place they chose, or none to find it automatically). Answers the reason when it was not saved. */
export async function setLocation(fields: LocationFields): Promise<string | null> {
	const message = await saveSettings({ ok: true, value: fields });
	if (message === null) syncTheme();
	return message;
}

/**
 * Gives the location back to the app. An account finds it again from its internet address (the server does
 * that when it saves), a guest has none and the theme follows the main city of the timezone.
 */
export async function detectLocation(): Promise<string | null> {
	const message = await setLocation(AUTOMATIC_LOCATION);
	if (message !== null || !tasker.account.email) return message;
	try {
		const found = await tasker.backend.settings.load();
		const next = { ...tasker.settings };
		for (const key of LOCATION_KEYS) Object.assign(next, { [key]: found[key] });
		tasker.settings = next;
		syncTheme();
	} catch {
		// The theme keeps the timezone's city until the next load
	}
	return null;
}

/** Saves the timezone (to the account, or on a guest's device) and applies it right away. */
export async function setTimezone(timezone: string) {
	tasker.timezone = timezone;
	tasker.settings.timezone = timezone;
	syncTheme();
	await tasker.backend.settings.saveTimezone(timezone);
}

export function setVolume(value: number) {
	tasker.volume = value;
	save('volume', String(value));
	// Dragging the slider up implies the user wants to hear things again
	if (value > 0 && tasker.isMuted) setMuted(false);
}

let unmuteTimer: ReturnType<typeof setTimeout> | undefined;

function applyMute(muted: boolean, until: number | null) {
	clearTimeout(unmuteTimer);
	tasker.isMuted = muted;
	tasker.mutedUntil = muted ? until : null;
	save('muted', String(muted));
	save('mutedUntil', tasker.mutedUntil === null ? '' : String(tasker.mutedUntil));
	// Sound returns on its own
	if (muted && until !== null)
		unmuteTimer = setTimeout(() => applyMute(false, null), until - Date.now());
}

export function setMuted(muted: boolean) {
	applyMute(muted, null);
}

/** Mutes for a while (`null` minutes: until the user unmutes). */
export function muteFor(minutes: number | null) {
	applyMute(true, muteEnd(Date.now(), minutes));
}

/** Loads saved preferences into `tasker`, applies the theme and keeps daytime mode current. Returns a cleanup. */
export function initPreferences() {
	try {
		const theme = localStorage.getItem('theme');
		if (theme === 'light' || theme === 'dark' || theme === 'auto') tasker.themeMode = theme;

		const volume = localStorage.getItem('volume');
		if (volume !== null && Number(volume) >= 0 && Number(volume) <= 100)
			tasker.volume = Number(volume);

		const until = Number(localStorage.getItem('mutedUntil'));
		const mute = restoreMute(
			localStorage.getItem('muted') === 'true',
			until > 0 ? until : null,
			Date.now()
		);
		applyMute(mute.muted, mute.until);

		// The hours the theme used to be set by hand, the sun replaced them
		localStorage.removeItem('dayStart');
		localStorage.removeItem('dayEnd');
	} catch {
		// Storage can be blocked, the defaults stay in place
	}

	// The inline script in app.html only guesses, so sync to the loaded settings
	applyDark(resolveDark());

	const interval = setInterval(() => {
		if (tasker.themeMode === 'auto') syncTheme();
	}, 60_000);
	return () => clearInterval(interval);
}
