import { AssistantError } from '#lib/core/context.js';
import {
	MAX_AUDIO_BYTES,
	REALTIME_URL,
	TRANSCRIBE_MODEL,
	TRANSCRIBE_URL,
	audioExtension,
	buildSpeechEvents,
	isAudioMime,
	pcm16ToWav,
	readSpeechEvent
} from '#lib/voice.js';

const TIMEOUT_MS = 30_000;

/** Opens the Realtime socket with the key: the server sends a header, a browser a subprotocol. */
export type Connect = (url: string, key: string) => WebSocket;

async function call(url: string, key: string, init: RequestInit) {
	let response: Response;
	try {
		response = await fetch(url, {
			...init,
			method: 'POST',
			headers: { ...init.headers, Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		throw new AssistantError('Could not reach OpenAI or it took too long', 502);
	}
	if (response.status === 401)
		throw new AssistantError('OpenAI rejected the saved key, check it in Settings', 400);
	if (response.status === 429)
		throw new AssistantError(
			'OpenAI is out of capacity or your quota is used up, try again later',
			429
		);
	if (!response.ok) throw new AssistantError('OpenAI could not handle the audio, try again', 502);
	return response;
}

/** Throws the reason when a recording cannot be transcribed, so callers can refuse before spending anything. */
export function checkAudio(audio: Blob) {
	if (audio.size === 0) throw new AssistantError('The recording was empty', 400);
	if (audio.size > MAX_AUDIO_BYTES) throw new AssistantError('The recording is too long', 413);
	if (!isAudioMime(audio.type)) throw new AssistantError('That is not an audio recording', 415);
}

/** Speech to text for one push-to-talk recording. Nothing is kept, the audio only passes through. */
export async function transcribe(key: string, audio: Blob): Promise<string> {
	checkAudio(audio);

	const form = new FormData();
	form.set('model', TRANSCRIBE_MODEL);
	form.set('response_format', 'json');
	form.set('file', audio, `speech.${audioExtension(audio.type)}`);

	const response = await call(TRANSCRIBE_URL, key, { body: form });
	const body: { text?: string } = await response.json().catch(() => ({}));
	return (body.text ?? '').trim();
}

/**
 * Text to speech through one short Realtime session: the text goes in, PCM audio chunks come back and are returned as a WAV.
 * A session lives for one line only. The text is already limited by `parseSpeakBody`.
 */
export function speak(key: string, text: string, connect: Connect): Promise<Uint8Array> {
	return new Promise<Uint8Array>((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let settled = false;
		const socket = connect(REALTIME_URL, key);

		const finish = (error?: AssistantError) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (socket.readyState <= WebSocket.OPEN) socket.close();
			if (error) reject(error);
			else if (chunks.length === 0)
				reject(new AssistantError('OpenAI sent no audio, try again', 502));
			else resolve(pcm16ToWav(chunks));
		};
		const timer = setTimeout(
			() => finish(new AssistantError('OpenAI took too long to speak', 502)),
			TIMEOUT_MS
		);

		socket.onopen = () =>
			buildSpeechEvents(text).forEach((event) => socket.send(JSON.stringify(event)));
		socket.onmessage = (message) => {
			const event = readSpeechEvent(String(message.data));
			if (event.kind === 'audio') chunks.push(event.pcm);
			else if (event.kind === 'done') finish();
			else if (event.kind === 'error') {
				console.error('Realtime speech error:', event.message);
				finish(new AssistantError('OpenAI could not speak that, try again', 502));
			}
		};
		// A rejected key fails the handshake, which shows up as an error or close without any message
		socket.onerror = () =>
			finish(new AssistantError('Could not reach OpenAI, or it rejected the saved key', 502));
		socket.onclose = () => finish(new AssistantError('The speech connection closed early', 502));
	});
}
