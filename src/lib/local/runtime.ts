/**
 * Everything a guest's device runs, put together: the database, the local backend, the agent loop
 * and the tabs of the device talking to each other (D8). One tab leads (`leader.ts`) and only it
 * ticks, so an alarm rings once and the agent reacts once. Every tab reads and writes the same
 * IndexedDB, and what happens is passed on over a `BroadcastChannel`: hints (a card, an alarm, a
 * changed schedule) and the days a plan change touched, so the other tabs show it too.
 */
import type { Backend } from '#lib/backend.js';
import type { Hint, Model } from '#lib/core/context.js';
import { TICK_MS, createAgentLoop } from '#lib/local/agent-loop.js';
import { localBackend } from '#lib/local/backend.js';
import { openLocalDb } from '#lib/local/db.js';
import { electLeader, type LockApi } from '#lib/local/leader.js';
import { localRepo } from '#lib/local/repo.js';

export const DATABASE_NAME = 'tasker-guest';
export const CHANNEL_NAME = 'tasker-local';

/** What one tab tells the others. A `react` message goes to the leader only, who runs the agent. */
export type LocalMessage = Hint | { type: 'plan'; dates: string[] } | { type: 'react' };

export interface RuntimeEnv {
	factory: IDBFactory;
	locks?: LockApi;
	channel?: BroadcastChannel | null;
	now?: () => number;
	tickMs?: number;
	coalesceMs?: number;
	modelFor?: (key: string) => Model;
}

/** The browser's own storage, locks and channel. */
export const browserEnv = (): RuntimeEnv => ({
	factory: indexedDB,
	locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
	channel: typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
});

export interface RuntimeHandlers {
	/** What this tab shows: its own hints and what the other tabs sent. */
	handle(message: Hint | { type: 'plan'; dates: string[] }): void;
	/** Whether this tab is the one that ticks and makes sound. */
	onLeader(leading: boolean): void;
}

export async function startLocalRuntime(
	handlers: RuntimeHandlers,
	env: RuntimeEnv = browserEnv()
): Promise<{ backend: Backend; stop(): void }> {
	const { channel = null } = env;
	const repo = localRepo(await openLocalDb(env.factory, DATABASE_NAME));
	let leading = false;
	let timer: ReturnType<typeof setInterval> | undefined;

	/** Shows the hint here and tells the other tabs. */
	const hint = (message: Hint) => {
		handlers.handle(message);
		channel?.postMessage(message satisfies LocalMessage);
		return 1;
	};
	const agent = createAgentLoop({
		repo,
		hint,
		now: env.now,
		coalesceMs: env.coalesceMs,
		modelFor: env.modelFor
	});
	const tick = () => agent.tick().catch((error) => console.error('[agent] tick failed', error));

	const backend = localBackend({
		repo,
		now: env.now,
		hint,
		// Only the leader runs the agent: the others ask it to look
		react: () => (leading ? agent.reactSoon() : channel?.postMessage({ type: 'react' })),
		planChanged: (dates) => channel?.postMessage({ type: 'plan', dates } satisfies LocalMessage),
		modelFor: env.modelFor
	});

	if (channel)
		channel.onmessage = (event: MessageEvent<LocalMessage>) => {
			const message = event.data;
			if (message.type === 'react') {
				if (leading) agent.reactSoon();
			} else handlers.handle(message);
		};

	handlers.onLeader(false);
	electLeader(env.locks, () => {
		leading = true;
		handlers.onLeader(true);
		void tick();
		timer = setInterval(() => void tick(), env.tickMs ?? TICK_MS);
	});

	return {
		backend,
		stop() {
			clearInterval(timer);
			agent.stop();
			if (channel) channel.close();
		}
	};
}
