import { tasker } from '#lib/app.svelte.js';
import {
	MAX_RECORDING_MS,
	MIN_RECORDING_MS,
	pickRecordingType,
	sttEngine,
	speakable,
	speechVolume
} from '#lib/voice.js';

/** Browser side of voice: push-to-talk recording, transcription and spoken replies. Server side is `src/lib/server/voice.ts`. */

let recorder: MediaRecorder | undefined;
let chosenType = '';
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

/** The slice of the browser's speech recognition used without a key (not in the DOM typings yet). */
interface Recognition {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onstart: (() => void) | null;
	onend: (() => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onresult:
		| ((event: {
				results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
		  }) => void)
		| null;
	start(): void;
	stop(): void;
	abort(): void;
}

const recognitionClass = (): (new () => Recognition) | undefined => {
	const scope = globalThis as unknown as Record<string, (new () => Recognition) | undefined>;
	return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

/** The speech to text in use: OpenAI with a key (unless switched off to save cost), else the browser's own. */
const engine = () =>
	sttEngine({
		hasKey: tasker.settings.hasOpenaiKey,
		openaiTranscribe: tasker.settings.openaiTranscribe,
		canRecord: canRecord(),
		browser: !!recognitionClass()
	});

let recognition: Recognition | undefined;
/** Resolves with the final text once the browser recognition has ended. */
let recognized: Promise<string> | undefined;

export const canRecord = () =>
	typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** A mic is offered with a saved key (OpenAI) or, without one, where the browser can recognise speech itself. */
export const canTalk = () => engine() !== null;

/** Starts the browser recognition. Resolves false when it cannot start (no permission, no service). */
async function startBrowserRecognition(): Promise<boolean> {
	const Class = recognitionClass();
	if (!Class) return false;
	const active = new Class();
	active.lang = navigator.language || 'en-US';
	active.continuous = true;
	active.interimResults = false;

	let text = '';
	let finish: (value: string) => void = () => {};
	recognized = new Promise<string>((resolve) => (finish = resolve));
	active.onresult = (event) => {
		for (const result of Array.from(event.results)) {
			if (result.isFinal) text += ` ${result[0].transcript}`;
		}
	};
	let settle: (ok: boolean) => void = () => {};
	const started = new Promise<boolean>((resolve) => (settle = resolve));
	active.onstart = () => settle(true);
	active.onerror = (event) => {
		// 'no-speech' and 'aborted' just end the session, anything else means it never worked
		if (event.error !== 'no-speech' && event.error !== 'aborted') settle(false);
	};
	active.onend = () => {
		settle(false);
		finish(text.trim());
		tasker.voice.recording = false;
	};
	recognition = active;
	try {
		active.start();
	} catch {
		recognition = undefined;
		return false;
	}
	if (await started) return true;
	recognition = undefined;
	return false;
}

/**
 * Starts recording while the key or button is held. Resolves false when the microphone is not available.
 * `onLimit` receives the text if the recording ended by itself at the time limit.
 */
export async function startRecording(onLimit: (text: string | null) => void): Promise<boolean> {
	const mode = engine();
	const browser = mode === 'browser';
	if (tasker.voice.recording || tasker.voice.transcribing || !mode) {
		return false;
	}
	// The assistant must not hear itself
	stopSpeaking();
	cancelled = false;
	tasker.voice.recording = true;

	if (browser) {
		const ok = await startBrowserRecognition();
		if (!ok) {
			tasker.voice.recording = false;
			return false;
		}
		startedAt = Date.now();
		if (cancelled) {
			recognition?.abort();
			tasker.voice.recording = false;
			return true;
		}
		limitTimer = setTimeout(
			() => void finishRecording().then(onLimit, () => onLimit(null)),
			MAX_RECORDING_MS
		);
		return true;
	}

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
	chosenType = type ?? '';
	recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
	chunks = [];
	recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
	recorder.start();
	startedAt = Date.now();
	limitTimer = setTimeout(
		() => void finishRecording().then(onLimit, () => onLimit(null)),
		MAX_RECORDING_MS
	);
	return true;
}

function releaseMicrophone() {
	stream?.getTracks().forEach((track) => track.stop());
	stream = undefined;
}

/** Ends the recording and returns what was said, `null` when it was too short, empty or failed. */
export async function finishRecording(): Promise<string | null> {
	clearTimeout(limitTimer);
	if (recognition) {
		const active = recognition;
		const result = recognized;
		recognition = undefined;
		recognized = undefined;
		active.stop();
		const text = (await result) ?? '';
		tasker.voice.recording = false;
		return Date.now() - startedAt < MIN_RECORDING_MS ? null : text || null;
	}
	const active = recorder;
	if (!active) {
		// Released before the microphone opened
		cancelled = true;
		return null;
	}
	recorder = undefined;

	const blob = await new Promise<Blob>((resolve) => {
		active.onstop = () => resolve(new Blob(chunks, { type: active.mimeType || chosenType }));
		active.stop();
	});
	releaseMicrophone();
	tasker.voice.recording = false;
	if (Date.now() - startedAt < MIN_RECORDING_MS) return null;

	tasker.voice.transcribing = true;
	try {
		return (await tasker.backend.voice.transcribe(blob)) || null;
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
		const blob = await tasker.backend.voice.speak(input);
		if (!blob || run !== speechRun) return;

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
