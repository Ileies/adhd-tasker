import { AssistantError } from '#lib/core/context.js';

const MODELS_URL = 'https://api.openai.com/v1/models';

/**
 * Asks OpenAI whether a key is accepted (a list request costs nothing). Throws the reason to show
 * when it is not. The server runs it for an account, the browser for a guest, always with the user's own key.
 */
export async function checkOpenaiKey(key: string): Promise<string> {
	const trimmed = key.trim();
	if (!trimmed) throw new AssistantError('Paste your key first', 400);

	const response = await fetch(MODELS_URL, {
		headers: { Authorization: `Bearer ${trimmed}` },
		signal: AbortSignal.timeout(10_000)
	}).catch(() => null);
	if (!response) throw new AssistantError('Could not reach OpenAI to check the key', 502);
	if (!response.ok) throw new AssistantError('OpenAI did not accept this key', 400);
	return trimmed;
}
