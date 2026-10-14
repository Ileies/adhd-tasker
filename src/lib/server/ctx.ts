import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import type { Ctx } from '#lib/core/context.js';
import { decrypt } from '#lib/server/crypto.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { publish } from '#lib/server/stream.js';
import { openaiModel } from '#lib/openai.js';

export const OPENAI_KEY_PURPOSE = 'openai-key';

type Reactor = (email: string) => void;
let reactor: Reactor | null = null;

/** The agent registers itself here, so mutation paths only know `emit` and never the model code. */
export function setReactor(next: Reactor) {
	reactor = next;
}

/** The key as the user typed it, `null` when none is saved or it cannot be read. */
export const readOpenaiKey = (stored: string | null | undefined) =>
	decrypt(stored, GOOGLE_CLIENT_SECRET, OPENAI_KEY_PURPOSE);

/**
 * What the core rules get on the server: the account's rows, the clock, the open tabs of that account.
 * Pass the saved (encrypted) key to give the context a model, leave it out for plan edits that never need one.
 */
export function serverCtx(email: string, storedKey?: string | null): Ctx {
	const key = readOpenaiKey(storedKey);
	return {
		repo: dbRepo(email),
		now: () => Date.now(),
		model: key ? openaiModel(key) : null,
		hint: (message) => publish(email, message),
		react: () => reactor?.(email)
	};
}
