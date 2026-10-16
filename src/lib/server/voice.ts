import { AssistantError } from '#lib/core/context.js';
import { rateLimit } from '#lib/core/rate.js';
import { checkAudio, speak as speakWith, transcribe as transcribeWith } from '#lib/core/voice.js';
import { readOpenaiKey } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';

const checkRate = rateLimit(
	{ requests: 30, windowMs: 5 * 60_000 },
	'Too many voice requests, wait a few minutes'
);

async function openaiSettings(email: string) {
	const settings = await dbRepo(email).settings.get();
	const key = readOpenaiKey(settings.openaiKey);
	if (!key) throw new AssistantError('Add your OpenAI key in Settings first', 400);
	return { key, voiceLanguage: settings.voiceLanguage };
}

const openaiKey = async (email: string) => (await openaiSettings(email)).key;

/** Speech to text for one push-to-talk recording in the user's speech language. Nothing is kept, the audio only passes through. */
export async function transcribe(email: string, audio: Blob): Promise<string> {
	checkAudio(audio);
	checkRate(email);
	const { key, voiceLanguage } = await openaiSettings(email);
	return transcribeWith(key, audio, voiceLanguage);
}

/** Text to speech for an account. Bun's WebSocket takes request headers, the browser typing does not know the option. */
export async function speak(email: string, text: string): Promise<Uint8Array> {
	checkRate(email);
	const key = await openaiKey(email);
	return speakWith(
		key,
		text,
		(url, token) =>
			new (WebSocket as unknown as new (
				url: string,
				options: { headers: Record<string, string> }
			) => WebSocket)(url, { headers: { Authorization: `Bearer ${token}` } })
	);
}
