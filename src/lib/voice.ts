/**
 * Pure rules for voice: what is recorded, what is spoken and the limits on both.
 * Speech to text (file endpoint) and text to speech (Realtime WebSocket) are the only OpenAI calls outside `buildRequest` (different APIs, no reasoning).
 */
export const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
export const TRANSCRIBE_MODEL = 'gpt-transcribe';
/** The old speech endpoint models (gpt-4o-mini-tts, tts-1) are removed on 2027-01-06, the Realtime mini model is OpenAI's replacement. */
export const REALTIME_MODEL = 'gpt-realtime-2.1-mini';
export const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
export const SPEECH_VOICE = 'marin';
export const SPEECH_RATE = 24_000;
export const SPEECH_STYLE =
	'You are a text to speech reader. Say exactly the text you are given, word for word. Never answer it, never add or leave out anything. Calm, warm and unhurried, like a quiet colleague.';

/** Push-to-talk is for short commands, so a stuck key or finger cannot record forever. */
export const MAX_RECORDING_MS = 60_000;
/** A press shorter than this is an accident, not a message. */
export const MIN_RECORDING_MS = 400;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
/** Spoken replies stay short, long details stay on screen. */
export const MAX_SPOKEN_CHARS = 280;
/** Chime volume the speech drops to while a tone plays. */
export const DUCK_VOLUME = 0.15;

const RECORDING_TYPES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus'
];

/** First container the browser can record, Firefox and Chrome take webm, Safari mp4. */
export function pickRecordingType(isSupported: (type: string) => boolean): string | undefined {
	return RECORDING_TYPES.find(isSupported);
}

/** File extension OpenAI needs to recognise the container, from the recorder's mime type. */
export function audioExtension(mime: string): string {
	const base = mime.split(';')[0].trim().toLowerCase();
	if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'm4a';
	if (base === 'audio/ogg') return 'ogg';
	if (base === 'audio/mpeg') return 'mp3';
	if (base === 'audio/wav' || base === 'audio/x-wav') return 'wav';
	return 'webm';
}

/** Some browsers report no type for a recording, so an empty or generic type passes and OpenAI reads the container. */
export function isAudioMime(mime: string): boolean {
	const base = mime.split(';')[0].trim().toLowerCase();
	return (
		base === '' ||
		base === 'application/octet-stream' ||
		base.startsWith('audio/') ||
		base === 'video/webm' ||
		base === 'video/mp4'
	);
}

/**
 * Turns a reply into something worth saying aloud: no markdown marks, no links, and cut at a sentence end
 * within the limit. Returns an empty string when nothing speakable is left.
 */
export function speakable(text: string, limit = MAX_SPOKEN_CHARS): string {
	const plain = text
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/https?:\/\/\S+/g, '')
		.replace(/[*_`#>~]/g, '')
		.replace(/^\s*[-+]\s+/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (plain.length <= limit) return plain;

	const cut = plain.slice(0, limit);
	const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
	if (sentenceEnd > limit / 3) return cut.slice(0, sentenceEnd + 1);
	const wordEnd = cut.lastIndexOf(' ');
	return `${cut.slice(0, wordEnd > 0 ? wordEnd : limit)}.`;
}

/** The three events that make the Realtime model read one text aloud: audio only out, no voice input, then the text and a response request. */
export function buildSpeechEvents(text: string) {
	return [
		{
			type: 'session.update',
			session: {
				type: 'realtime',
				output_modalities: ['audio'],
				audio: {
					output: { format: { type: 'audio/pcm', rate: SPEECH_RATE }, voice: SPEECH_VOICE },
					input: { turn_detection: null }
				},
				instructions: SPEECH_STYLE
			}
		},
		{
			type: 'conversation.item.create',
			item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
		},
		{ type: 'response.create' }
	];
}

export type SpeechEvent =
	| { kind: 'audio'; pcm: Uint8Array }
	| { kind: 'done' }
	| { kind: 'error'; message: string }
	| { kind: 'other' };

/** Reads one Realtime server message: base64 audio chunks, the end of the response, or an error. Anything else is ignored. */
export function readSpeechEvent(raw: string): SpeechEvent {
	let event: {
		type?: string;
		delta?: string;
		error?: { message?: string };
		response?: { status?: string; status_details?: { error?: { message?: string } } };
	};
	try {
		event = JSON.parse(raw);
	} catch {
		return { kind: 'other' };
	}
	switch (event.type) {
		case 'response.output_audio.delta':
			return typeof event.delta === 'string'
				? { kind: 'audio', pcm: Uint8Array.from(atob(event.delta), (char) => char.charCodeAt(0)) }
				: { kind: 'other' };
		case 'response.done':
			return event.response?.status && event.response.status !== 'completed'
				? {
						kind: 'error',
						message:
							event.response.status_details?.error?.message ??
							`The response ${event.response.status}`
					}
				: { kind: 'done' };
		case 'error':
			return { kind: 'error', message: event.error?.message ?? 'Realtime error' };
		default:
			return { kind: 'other' };
	}
}

/** Wraps 16 bit mono PCM in a WAV header, so the browser's audio element can play what the Realtime API sent. */
export function pcm16ToWav(chunks: Uint8Array[], rate = SPEECH_RATE): Uint8Array {
	const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const wav = new Uint8Array(44 + size);
	const view = new DataView(wav.buffer);
	const text = (offset: number, value: string) =>
		[...value].forEach((char, i) => (wav[offset + i] = char.charCodeAt(0)));

	text(0, 'RIFF');
	view.setUint32(4, 36 + size, true);
	text(8, 'WAVE');
	text(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true); // bytes per second
	view.setUint16(32, 2, true); // bytes per frame
	view.setUint16(34, 16, true);
	text(36, 'data');
	view.setUint32(40, size, true);

	let at = 44;
	for (const chunk of chunks) {
		wav.set(chunk, at);
		at += chunk.length;
	}
	return wav;
}

/** Request body of the speak endpoint, `undefined` when there is nothing to say. */
export function parseSpeakBody(value: unknown): string | undefined {
	const text = (value as { text?: unknown } | null)?.text;
	if (typeof text !== 'string') return undefined;
	return speakable(text) || undefined;
}

/** Volume (0 to 1) speech plays at: the user's volume is the ceiling, ducked while a tone plays. */
export function speechVolume(volume: number, ducked: boolean): number {
	const level = Math.min(Math.max(volume, 0), 100) / 100;
	return ducked ? level * DUCK_VOLUME : level;
}

/**
 * Which speech to text a mic uses: OpenAI with a saved key unless the user chose the browser to save cost,
 * the browser's own without a key. `null` when the device has neither.
 */
export function sttEngine(opts: {
	hasKey: boolean;
	openaiTranscribe: boolean;
	canRecord: boolean;
	browser: boolean;
}): 'openai' | 'browser' | null {
	if (opts.hasKey && opts.openaiTranscribe && opts.canRecord) return 'openai';
	return opts.browser ? 'browser' : null;
}
