import { flushSync } from 'svelte';
import { tasker, type ThemeMode } from '#lib/app.svelte.js';
import { minutesNow } from '#lib/time.js';

function save(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {}
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

/** Saves the timezone to the account and applies it right away. */
export async function setTimezone(timezone: string) {
	tasker.timezone = timezone;
	syncTheme();
	await fetch('/settings/timezone', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ timezone })
	});
}

export function setVolume(value: number) {
	tasker.volume = value;
	save('volume', String(value));
	// Dragging the slider up implies the user wants to hear things again
	if (value > 0 && tasker.isMuted) setMuted(false);
}

export function setMuted(muted: boolean) {
	tasker.isMuted = muted;
	save('muted', String(muted));
}

export function isSetupDone(): boolean {
	try {
		return localStorage.getItem('setupDone') === 'true';
	} catch {
		return true;
	}
}

export function finishSetup() {
	save('setupDone', 'true');
}

/** Loads saved preferences into `tasker`, applies the theme and keeps daytime mode current. Returns a cleanup. */
export function initPreferences() {
	try {
		const theme = localStorage.getItem('theme');
		if (theme === 'light' || theme === 'dark' || theme === 'auto') tasker.themeMode = theme;

		const volume = localStorage.getItem('volume');
		if (volume !== null && Number(volume) >= 0 && Number(volume) <= 100)
			tasker.volume = Number(volume);

		tasker.isMuted = localStorage.getItem('muted') === 'true';

		for (const key of ['dayStart', 'dayEnd'] as const) {
			const raw = localStorage.getItem(key);
			if (raw !== null && Number(raw) >= 0 && Number(raw) < 1440) tasker[key] = Number(raw);
		}
	} catch {}

	// The inline script in app.html only guesses, so sync to the loaded settings
	applyDark(resolveDark());

	const interval = setInterval(() => {
		if (tasker.themeMode === 'auto') syncTheme();
	}, 60_000);
	return () => clearInterval(interval);
}
