import { tasker } from '#lib/app.svelte.js';
import { browser } from '$app/env';
import { readTone, ringTimeline, toneLength, toneNotes, type Note, type Tone } from '#lib/tones.js';
import { duckSpeech } from '#lib/speech.js';
import { audioContext as sharedAudio, runningAudio } from '#lib/audio.js';

export function playSound(type: 'task-started' | 'reminder' | 'wrap-up' | 'done') {
	if (!browser || tasker.isMuted || tasker.volume <= 0) return;
	// A browser that has not unlocked audio yet stays silent, the silence line says so
	const audioContext = runningAudio();
	if (!audioContext) return;
	// Anchor sounds win over speech
	duckSpeech(type === 'task-started' ? 200 : 1200);

	const master = audioContext.createGain();
	master.gain.value = tasker.volume / 100;
	master.connect(audioContext.destination);

	switch (type) {
		case 'task-started': {
			// Energizing upward sweep to signal task start - helps with motivation
			// Quick, punchy "power-on" sound with bright harmonics for immediate focus activation
			const fundamental = audioContext.createOscillator();
			const harmonic1 = audioContext.createOscillator();
			const harmonic2 = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			fundamental.connect(gainNode);
			harmonic1.connect(gainNode);
			harmonic2.connect(gainNode);
			gainNode.connect(master);

			// Bright, energetic frequencies - like a notification "ding" but richer
			fundamental.frequency.setValueAtTime(880, audioContext.currentTime); // A5 - bright and attention-grabbing
			harmonic1.frequency.setValueAtTime(1760, audioContext.currentTime); // A6 - octave for brightness
			harmonic2.frequency.setValueAtTime(1320, audioContext.currentTime); // E6 - perfect fifth for fullness

			// Quick, punchy envelope - like a bell strike
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(0.6, audioContext.currentTime + 0.005); // Very fast attack
			gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2); // Quick decay

			fundamental.start(audioContext.currentTime);
			harmonic1.start(audioContext.currentTime);
			harmonic2.start(audioContext.currentTime);
			fundamental.stop(audioContext.currentTime + 0.2);
			harmonic1.stop(audioContext.currentTime + 0.2);
			harmonic2.stop(audioContext.currentTime + 0.2);
			break;
		}
		case 'reminder': {
			// Gentle but attention-grabbing reminder - not jarring but noticeable
			// Soft two-tone chime that's pleasant but noticeable
			const oscillator1 = audioContext.createOscillator();
			const oscillator2 = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			oscillator1.connect(gainNode);
			oscillator2.connect(gainNode);
			gainNode.connect(master);

			// Gentle harmonic interval (perfect fifth)
			oscillator1.frequency.setValueAtTime(440, audioContext.currentTime); // A4
			oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5

			// Soft, non-intrusive envelope
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
			gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.3);
			gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.2);

			oscillator1.start(audioContext.currentTime);
			oscillator2.start(audioContext.currentTime);
			oscillator1.stop(audioContext.currentTime + 1.2);
			oscillator2.stop(audioContext.currentTime + 1.2);
			break;
		}
		case 'wrap-up': {
			// Two soft notes stepping down, "this is coming to an end": lower and slower than the reminder, never urgent
			const oscillator = audioContext.createOscillator();
			const gainNode = audioContext.createGain();
			oscillator.connect(gainNode);
			gainNode.connect(master);

			const start = audioContext.currentTime;
			oscillator.frequency.setValueAtTime(587.33, start); // D5
			oscillator.frequency.setValueAtTime(440, start + 0.45); // A4

			gainNode.gain.setValueAtTime(0, start);
			gainNode.gain.linearRampToValueAtTime(0.18, start + 0.08);
			gainNode.gain.exponentialRampToValueAtTime(0.06, start + 0.44);
			gainNode.gain.linearRampToValueAtTime(0.16, start + 0.5);
			gainNode.gain.exponentialRampToValueAtTime(0.001, start + 1.3);

			oscillator.start(start);
			oscillator.stop(start + 1.3);
			break;
		}
		case 'done': {
			// Three soft notes stepping up, a warm "finished": slower and rounder than the task-started ding
			const start = audioContext.currentTime;
			[523.25, 659.25, 783.99].forEach((hz, index) => {
				const at = start + index * 0.14;
				const oscillator = audioContext.createOscillator();
				const gainNode = audioContext.createGain();
				oscillator.connect(gainNode);
				gainNode.connect(master);
				oscillator.frequency.setValueAtTime(hz, at);
				gainNode.gain.setValueAtTime(0, at);
				gainNode.gain.linearRampToValueAtTime(0.22, at + 0.03);
				gainNode.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
				oscillator.start(at);
				oscillator.stop(at + 0.9);
			});
			break;
		}
	}
}

/**
 * Plays a stored or agent-made tone. The sequence is validated again here, so nothing over the caps can ever play,
 * and the user's volume is the ceiling. Muted means silent, the alarm banner still shows.
 */
export function playTone(tone: Tone) {
	if (!browser || tasker.isMuted || tasker.volume <= 0) return;
	const { wave, notes } = toneNotes(readTone(tone));
	const audioContext = runningAudio();
	if (!audioContext) return;

	const master = audioContext.createGain();
	master.gain.value = tasker.volume / 100;
	master.connect(audioContext.destination);

	const at = scheduleNotes(audioContext, master, wave, notes, audioContext.currentTime + 0.02);
	duckSpeech((at - audioContext.currentTime) * 1000);
	// The context is shared, so only this tone's own gain node goes once the last note has ended
	setTimeout(() => master.disconnect(), (at - audioContext.currentTime) * 1000 + 300);
}

/** Schedules a note sequence from `start` (audio clock seconds) and returns the time it ends. */
function scheduleNotes(
	audioContext: AudioContext,
	destination: AudioNode,
	wave: OscillatorType,
	notes: Note[],
	start: number
): number {
	let at = start;
	for (const note of notes) {
		const length = note.ms / 1000;
		const oscillator = audioContext.createOscillator();
		const gain = audioContext.createGain();
		oscillator.type = wave;
		oscillator.frequency.setValueAtTime(note.hz, at);
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(0.35, at + 0.01);
		gain.gain.setValueAtTime(0.35, at + Math.max(0.01, length - 0.06));
		gain.gain.exponentialRampToValueAtTime(0.001, at + length);
		oscillator.connect(gain);
		gain.connect(destination);
		oscillator.start(at);
		oscillator.stop(at + length);
		at += length + (note.rest ?? 0) / 1000;
	}
	return at;
}

/** How far ahead the next repeats are put on the audio clock, so a throttled background tab keeps ringing without a gap. */
const RING_LOOKAHEAD_MS = 6000;

/**
 * Rings a tone back to back for `durationMs`, getting louder over the first seconds (`ringGain`), then stops by
 * itself. The user's volume stays the ceiling and is read live, so muting or turning it down takes effect at once.
 * Returns the stop function.
 */
export function startRinging(tone: Tone, durationMs: number): () => void {
	if (!browser) return () => {};
	const { wave, notes } = toneNotes(readTone(tone));
	const timeline = ringTimeline({ wave, notes }, durationMs);
	if (timeline.length === 0) return () => {};

	// Not `runningAudio`: a ring that waits on a locked context starts at the first tap, while its banner still shows
	const audioContext = sharedAudio();
	void audioContext.resume().catch(() => {});
	const master = audioContext.createGain();
	master.connect(audioContext.destination);
	const startedAt = audioContext.currentTime + 0.05;
	const phraseMs = toneLength({ wave, notes });

	let next = 0;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const stop = () => {
		if (stopped) return;
		stopped = true;
		clearTimeout(timer);
		// Notes already on the clock go silent with their master gain, the shared context stays open
		master.disconnect();
	};

	const tick = () => {
		if (stopped) return;
		const elapsedMs = (audioContext.currentTime - startedAt) * 1000;
		master.gain.value = tasker.isMuted ? 0 : tasker.volume / 100;
		while (next < timeline.length && timeline[next].atMs < elapsedMs + RING_LOOKAHEAD_MS) {
			const { atMs, gain } = timeline[next++];
			const repeat = audioContext.createGain();
			repeat.gain.value = gain;
			repeat.connect(master);
			scheduleNotes(audioContext, repeat, wave, notes, startedAt + atMs / 1000);
			duckSpeech(atMs - elapsedMs + phraseMs);
		}
		if (next >= timeline.length && elapsedMs > timeline[timeline.length - 1].atMs + phraseMs)
			return stop();
		timer = setTimeout(tick, 1000);
	};
	tick();
	return stop;
}

export { showToast, dismissToast, errorText } from '#lib/toast.js';
export { createTask, updateTask, deleteTask, loadDay } from '#lib/tasks.js';
