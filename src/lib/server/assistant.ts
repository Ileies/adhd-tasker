import { runAssistant as runTurn, type ChatMessage } from '#lib/core/assistant.js';
import { AssistantError } from '#lib/core/context.js';
import { rateLimit } from '#lib/core/rate.js';
import { serverCtx } from '#lib/server/ctx.js';
import type { Settings } from '#lib/core/repo.js';
import { dbRepo } from '#lib/server/db-repo.js';

const checkRate = rateLimit(
	{ requests: 20, windowMs: 5 * 60_000 },
	'Too many requests, wait a few minutes'
);

/** One chat turn for an account. The rate limit lives here because a server shares one process between users. */
export async function runAssistant(email: string, history: ChatMessage[]) {
	if (history.at(-1)?.role !== 'user') throw new AssistantError('Nothing to answer', 400);
	checkRate(email);
	const settings: Settings = await dbRepo(email).settings.get();
	return runTurn(serverCtx(email, settings.openaiKey), settings, history);
}
