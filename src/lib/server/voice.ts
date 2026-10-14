import { AssistantError } from '#lib/core/context.js';
import { checkAudio, speak as speakWith, transcribe as transcribeWith } from '#lib/core/voice.js';
import { readOpenaiKey } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';

const RATE_LIMIT = { requests: 30, windowMs: 5 * 60_000 };

const recent = new Map<string, number[]>();

function checkRate(email: string) {
	const now = Date.now();
	const hits = (recent.get(email) ?? []).filter((at) => now - at < RATE_LIMIT.windowMs);
	if (hits.length >= RATE_LIMIT.requests)
		throw new AssistantError('Too many voice requests, wait a few minutes', 429);
	recent.set(email, [...hits, now]);
}

async function openaiKey(email: string) {
	const key = readOpenaiKey((await dbRepo(email).settings.get()).openaiKey);
	if (!key) throw new AssistantError('Add your OpenAI key in Settings first', 400);
	return key;
}

/** Speech to text for one push-to-talk recording. Nothing is kept, the audio only passes through. */
export async function transcribe(email: string, audio: Blob): Promise<string> {
	checkAudio(audio);
	checkRate(email);
	return transcribeWith(await openaiKey(email), audio);
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
