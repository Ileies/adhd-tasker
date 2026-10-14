import { tasker } from '#lib/app.svelte.js';
import { MAX_RECORDING_MS, MIN_RECORDING_MS, pickRecordingType, speakable, speechVolume } from '#lib/voice.js';

/** Browser side of voice: push-to-talk recording, transcription and spoken replies. Server side is `src/lib/server/voice.ts`. */

let recorder: MediaRecorder | undefined;
let stream: MediaStream | undefined;
let chunks: BlobPart[] = [];
let startedAt = 0;
let limitTimer: ReturnType<typeof setTimeout> | undefined;
/** A press that ended before the microphone opened, so the recording must not start after all. */
let cancelled = false;

let player: HTMLAudioElement | undefined;
let playerUrl: string | undefined;
let ducked = false;
let duckTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every speak and stop, so a slow fetch of older speech never plays over newer speech. */
let speechRun = 0;

export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Starts recording while the key or button is held. Resolves false when the microphone is not available.
 * `onLimit` receives the text if the recording ended by itself at the time limit.
 */
export async function startRecording(onLimit: (text: string | null) => void): Promise<boolean> {
	if (tasker.voice.recording || tasker.voice.transcribing || !canRecord()) return false;
	// The assistant must not hear itself
	stopSpeaking();
	cancelled = false;
	tasker.voice.recording = true;

	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		tasker.voice.recording = false;
		return false;
	}
	if (cancelled) {
		releaseMicrophone();
		tasker.voice.recording = false;
		return true;
	}

	const type = pickRecordingType((candidate) => MediaRecorder.isTypeSupported(candidate));
	recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
	chunks = [];
	recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
	recorder.start();
	startedAt = Date.now();
	limitTimer = setTimeout(() => void finishRecording().then(onLimit, () => onLimit(null)), MAX_RECORDING_MS);
	return true;
}

function releaseMicrophone() {
	stream?.getTracks().forEach((track) => track.stop());
	stream = undefined;
}

/** Ends the recording and returns what was said, `null` when it was too short, empty or failed. */
export async function finishRecording(): Promise<string | null> {
	clearTimeout(limitTimer);
	const active = recorder;
	if (!active) {
		// Released before the microphone opened
		cancelled = true;
		return null;
	}
	recorder = undefined;

	const blob = await new Promise<Blob>((resolve) => {
		active.onstop = () => resolve(new Blob(chunks, { type: active.mimeType }));
		active.stop();
	});
	releaseMicrophone();
	tasker.voice.recording = false;
	if (Date.now() - startedAt < MIN_RECORDING_MS) return null;

	tasker.voice.transcribing = true;
	try {
		const form = new FormData();
		form.set('audio', blob);
		const response = await fetch('/assistant/transcribe', { method: 'POST', body: form });
		if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Could not understand the recording');
		const { text }: { text: string } = await response.json();
		return text.trim() || null;
	} finally {
		tasker.voice.transcribing = false;
	}
}

function applyVolume() {
	if (player) player.volume = speechVolume(tasker.volume, ducked);
}

/** Follows the volume menu while something is being said, muting stops the speech. */
export function syncSpeechVolume() {
	if (tasker.isMuted || tasker.volume <= 0) stopSpeaking();
	else applyVolume();
}

/**
 * Lets a chime or alarm tone take over: speech drops to a whisper while it plays, then comes back.
 * Called by every sound the app makes, so speech never competes with an anchor sound.
 */
export function duckSpeech(ms: number) {
	if (!player) return;
	ducked = true;
	applyVolume();
	clearTimeout(duckTimer);
	duckTimer = setTimeout(() => {
		ducked = false;
		applyVolume();
	}, ms + 150);
}

export function stopSpeaking() {
	speechRun++;
	player?.pause();
	player = undefined;
	if (playerUrl) URL.revokeObjectURL(playerUrl);
	playerUrl = undefined;
	tasker.voice.speaking = false;
}

/**
 * Speaks a short text on this device. Silent when muted, and a failure is never worth interrupting the user for
 * (autoplay can be blocked until the first tap, the text is on screen anyway).
 */
export async function speak(text: string) {
	const input = speakable(text);
	if (!input || tasker.isMuted || tasker.volume <= 0) return;

	stopSpeaking();
	const run = speechRun;
	try {
		const response = await fetch('/assistant/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: input }) });
		if (!response.ok || run !== speechRun) return;
		const blob = await response.blob();
		if (run !== speechRun) return;

		playerUrl = URL.createObjectURL(blob);
		player = new Audio(playerUrl);
		ducked = false;
		applyVolume();
		const mine = player;
		mine.onended = () => run === speechRun && stopSpeaking();
		tasker.voice.speaking = true;
		await mine.play();
	} catch {
		if (run === speechRun) stopSpeaking();
	}
}
