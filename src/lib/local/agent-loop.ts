/**
 * What the server's scheduler does for every account, done for the one guest on this device:
 * fire what is due, look for plan events (`watch`), let the agent react to unhandled ones and
 * prune old rows. The rules are the core ones, the guardrails apply unchanged. Only the leading
 * tab of the device runs it (`leader.ts`), otherwise two tabs would ring and react twice.
 */
import { prune, react, watch } from '#lib/core/agent.js';
import type { Ctx, Hint, Model } from '#lib/core/context.js';
import type { Repo } from '#lib/core/repo.js';
import { fireDue } from '#lib/core/schedule.js';
import { LIMITS } from '#lib/guardrails.js';
import { openaiModel } from '#lib/openai.js';

export const TICK_MS = 15_000;
const PRUNE_EVERY_MS = 3_600_000;

export interface AgentLoopDeps {
	repo: Repo;
	hint(message: Hint): number;
	now?: () => number;
	/** Events within this time become one reaction, a dragged task is one burst of events. */
	coalesceMs?: number;
	/** Builds the model for the saved key, a test swaps it for a fake. */
	modelFor?(key: string): Model;
}

export function createAgentLoop(deps: AgentLoopDeps) {
	const { repo } = deps;
	const now = deps.now ?? Date.now;
	const coalesceMs = deps.coalesceMs ?? LIMITS.coalesceMs;
	const modelFor = deps.modelFor ?? openaiModel;
	let waiting: ReturnType<typeof setTimeout> | undefined;
	let lastPrune = 0;

	async function context(): Promise<Ctx> {
		const { openaiKey } = await repo.settings.get();
		return {
			repo,
			now,
			model: openaiKey ? modelFor(openaiKey) : null,
			hint: deps.hint,
			react: reactSoon
		};
	}

	/** One reaction over the unhandled events. Never throws, a failed reaction must not stop the tick. */
	async function reactNow() {
		try {
			await react(await context(), await repo.settings.get());
		} catch (error) {
			console.error('[agent] reaction failed', error);
		}
	}

	function reactSoon() {
		clearTimeout(waiting);
		waiting = setTimeout(() => {
			waiting = undefined;
			void reactNow();
		}, coalesceMs);
	}

	/** One pass of the 15 s loop. */
	async function tick() {
		const ctx = await context();
		const settings = await repo.settings.get();
		await fireDue(ctx, settings.timezone ?? 'UTC').catch((error) =>
			console.error('[agent] firing the schedule failed', error)
		);
		await watch(ctx, await repo.settings.get()).catch((error) =>
			console.error('[agent] watch failed', error)
		);

		// Safety net for events nobody is waiting on, for example after the tab was closed
		const open = await repo.events.unhandled();
		if (!waiting && open.some((event) => event.createdAt < now() - coalesceMs * 2))
			await reactNow();

		if (now() - lastPrune > PRUNE_EVERY_MS) {
			lastPrune = now();
			await prune(ctx);
		}
	}

	return { tick, reactSoon, reactNow, stop: () => clearTimeout(waiting) };
}
