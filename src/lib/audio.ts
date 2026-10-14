import { browser } from '$app/env';
import { tasker } from '#lib/app.svelte.js';

/** The page's one audio context. Browsers keep it suspended until the user has tapped or pressed a key. */
let context: AudioContext | null = null;

function syncBlocked() {
	tasker.device.audioBlocked = context !== null && context.state !== 'running';
}

/** Creates the shared context on first use and keeps `tasker.device.audioBlocked` in step with its state. */
export function audioContext(): AudioContext {
	if (!context) {
		context = new AudioContext();
		context.onstatechange = syncBlocked;
		syncBlocked();
	}
	return context;
}

/**
 * The context when it is running. Otherwise it asks to resume and returns `null`: a sound scheduled on a suspended
 * clock would only play once the browser unlocks it, long after its moment.
 */
export function runningAudio(): AudioContext | null {
	if (!browser) return null;
	const audio = audioContext();
	if (audio.state === 'running') return audio;
	void audio.resume().catch(() => {});
	return null;
}

/**
 * Creates the context on load and unlocks it with the first tap or key press, so an always-on screen that reloaded
 * overnight says so (the silence line) instead of failing quietly. Returns the cleanup.
 */
export function initAudio(): () => void {
	if (!browser) return () => {};
	const audio = audioContext();
	const events = ['pointerdown', 'keydown', 'touchend'] as const;

	const unlock = () => void audio.resume().catch(() => {});
	const stop = () => {
		events.forEach((name) => window.removeEventListener(name, unlock, true));
		audio.removeEventListener('statechange', done);
	};
	const done = () => {
		if (audio.state === 'running') stop();
	};
	events.forEach((name) => window.addEventListener(name, unlock, true));
	audio.addEventListener('statechange', done);
	// The browser may let it run right away, for example for an installed app
	done();
	return stop;
}
