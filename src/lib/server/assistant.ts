import { runAssistant as runTurn, type ChatMessage } from '#lib/core/assistant.js';
import { AssistantError } from '#lib/core/context.js';
import { serverCtx } from '#lib/server/ctx.js';
import type { Settings } from '#lib/core/repo.js';
import { dbRepo } from '#lib/server/db-repo.js';

const RATE_LIMIT = { requests: 20, windowMs: 5 * 60_000 };

const recent = new Map<string, number[]>();

function checkRate(email: string) {
	const now = Date.now();
	const hits = (recent.get(email) ?? []).filter((at) => now - at < RATE_LIMIT.windowMs);
	if (hits.length >= RATE_LIMIT.requests)
		throw new AssistantError('Too many requests, wait a few minutes', 429);
	recent.set(email, [...hits, now]);
}

/** One chat turn for an account. The rate limit lives here because a server shares one process between users. */
export async function runAssistant(email: string, history: ChatMessage[]) {
	if (history.at(-1)?.role !== 'user') throw new AssistantError('Nothing to answer', 400);
	checkRate(email);
	const settings: Settings = await dbRepo(email).settings.get();
	return runTurn(serverCtx(email, settings.openaiKey), settings, history);
}
