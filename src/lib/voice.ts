/**
 * Pure rules for voice: what is recorded, what is spoken and the limits on both.
 * Speech to text and text to speech are the only OpenAI calls outside `buildRequest` (different endpoints, no reasoning, nothing stored by the API).
 */
export const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
export const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const TRANSCRIBE_MODEL = 'gpt-transcribe';
/** Deprecated: OpenAI removes it on 2027-01-06, the only named replacement (gpt-realtime-2.1-mini) is Realtime only, see CLAUDE.md. */
export const SPEECH_MODEL = 'gpt-4o-mini-tts';
export const SPEECH_VOICE = 'sage';
export const SPEECH_STYLE = 'Calm, warm and unhurried. Speak briefly, like a quiet colleague.';

/** Push-to-talk is for short commands, so a stuck key or finger cannot record forever. */
export const MAX_RECORDING_MS = 60_000;
/** A press shorter than this is an accident, not a message. */
export const MIN_RECORDING_MS = 400;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
/** Spoken replies stay short, long details stay on screen. */
export const MAX_SPOKEN_CHARS = 280;
/** Chime volume the speech drops to while a tone plays. */
export const DUCK_VOLUME = 0.15;

const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

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

export function isAudioMime(mime: string): boolean {
	return mime.split(';')[0].trim().toLowerCase().startsWith('audio/') || mime.startsWith('video/webm');
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

export function buildSpeechRequest(text: string) {
	return { model: SPEECH_MODEL, voice: SPEECH_VOICE, input: text, instructions: SPEECH_STYLE, response_format: 'mp3' };
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
