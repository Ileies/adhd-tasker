import { flushSync } from 'svelte';
import { tasker, type ThemeMode } from '#lib/app.svelte.js';
import { minutesNow } from '#lib/time.js';
import { muteEnd, restoreMute } from '#lib/mute.js';

function save(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage can be blocked, the setting then only lasts for this page
	}
}

function resolveDark(): boolean {
	if (tasker.themeMode !== 'auto') return tasker.themeMode === 'dark';

	const minutes = minutesNow(tasker.timezone);
	const { dayStart, dayEnd } = tasker;
	const isDay =
		dayStart <= dayEnd
			? minutes >= dayStart && minutes < dayEnd
			: minutes >= dayStart || minutes < dayEnd;
	return !isDay;
}

function applyDark(dark: boolean) {
	document.documentElement.classList.toggle('dark', dark);
}

/** Re-evaluates the theme and cross-fades the page if it changed. */
function syncTheme() {
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

export function setDayTime(key: 'dayStart' | 'dayEnd', minutes: number) {
	tasker[key] = minutes;
	save(key, String(minutes));
	syncTheme();
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

		for (const key of ['dayStart', 'dayEnd'] as const) {
			const raw = localStorage.getItem(key);
			if (raw !== null && Number(raw) >= 0 && Number(raw) < 1440) tasker[key] = Number(raw);
		}
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
