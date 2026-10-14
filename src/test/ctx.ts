/**
 * A core context for tests: the local repo on a fresh fake IndexedDB, a clock you set, and a record
 * of the hints and reaction requests. Core rules take a `Ctx`, so they are tested here without a server.
 */
import type { Ctx, Hint, Model } from '#lib/core/context.js';
import { openLocalDb } from '#lib/local/db.js';
import { localRepo } from '#lib/local/repo.js';
import { freshIndexedDb } from '#test/idb.js';

export const NOW = Date.parse('2026-10-14T09:00:00Z');

export async function testCtx(options: { now?: number; model?: Model | null } = {}) {
	const hints: Hint[] = [];
	const state = { now: options.now ?? NOW, reacts: 0 };
	const repo = localRepo(await openLocalDb(freshIndexedDb(), 'test'));
	await repo.settings.update({ timezone: 'UTC' });
	const ctx: Ctx = {
		repo,
		now: () => state.now,
		model: options.model ?? null,
		hint: (message) => hints.push(message),
		react: () => void state.reacts++
	};
	return { ctx, repo, hints, state };
}
