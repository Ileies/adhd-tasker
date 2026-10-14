import { tasker } from '#lib/app.svelte.js';
import { browser } from '$app/env';
import { readTone, toneNotes, type Tone } from '#lib/tones.js';
import { duckSpeech } from '#lib/speech.js';

export function playSound(type: 'task-started' | 'reminder') {
	if (!browser || tasker.isMuted || tasker.volume <= 0) return;
	// Anchor sounds win over speech
	duckSpeech(type === 'task-started' ? 200 : 1200);

	const audioContext = new AudioContext();
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
	}
}

/**
 * Plays a stored or agent-made tone. The sequence is validated again here, so nothing over the caps can ever play,
 * and the user's volume is the ceiling. Muted means silent, the alarm banner still shows.
 */
export function playTone(tone: Tone) {
	if (!browser || tasker.isMuted || tasker.volume <= 0) return;
	const { wave, notes } = toneNotes(readTone(tone));

	const audioContext = new AudioContext();
	void audioContext.resume();
	const master = audioContext.createGain();
	master.gain.value = tasker.volume / 100;
	master.connect(audioContext.destination);

	let at = audioContext.currentTime + 0.02;
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
		gain.connect(master);
		oscillator.start(at);
		oscillator.stop(at + length);
		at += length + (note.rest ?? 0) / 1000;
	}
	duckSpeech((at - audioContext.currentTime) * 1000);
	setTimeout(
		() => void audioContext.close().catch(() => {}),
		(at - audioContext.currentTime) * 1000 + 300
	);
}

export { showToast, dismissToast } from '#lib/toast.js';
export { createTask, updateTask, deleteTask, loadDay } from '#lib/tasks.js';
