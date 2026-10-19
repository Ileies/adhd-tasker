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
import { deleteLocalDb, openLocalDb } from '#lib/local/db.js';
import { electLeader, type LockApi } from '#lib/local/leader.js';
import { localMarks } from '#lib/local/marks.js';
import { localRepo } from '#lib/local/repo.js';

export const DATABASE_NAME = 'tasker-guest';
export const CHANNEL_NAME = 'tasker-local';

/** What one tab tells the others. A `react` message goes to the leader only, who runs the agent. */
export type LocalMessage =
	| Hint
	| { type: 'plan'; dates: string[] }
	| { type: 'react' }
	/** The device's data was deleted: every tab starts again from an empty database. */
	| { type: 'reload' };

export interface RuntimeEnv {
	factory: IDBFactory;
	locks?: LockApi;
	channel?: BroadcastChannel | null;
	now?: () => number;
	tickMs?: number;
	coalesceMs?: number;
	modelFor?: (key: string) => Model;
	/** Asks the browser to keep the site's data. */
	persist?: () => void;
}

/** The browser's own storage, locks and channel. */
const browserEnv = (): RuntimeEnv => ({
	factory: indexedDB,
	locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
	channel: typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME),
	persist: () => void navigator.storage?.persist?.().catch(() => {})
});

export interface RuntimeHandlers {
	/** What this tab shows: its own hints and what the other tabs sent. */
	handle(message: Exclude<LocalMessage, { type: 'react' }>): void;
	/** Whether this tab is the one that ticks and makes sound. */
	onLeader(leading: boolean): void;
}

export async function startLocalRuntime(
	handlers: RuntimeHandlers,
	env: RuntimeEnv = browserEnv()
): Promise<{ backend: Backend; stop(): void }> {
	const { channel = null } = env;
	const db = await openLocalDb(env.factory, DATABASE_NAME);
	const repo = localRepo(db);
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
		modelFor: env.modelFor,
		persist: env.persist,
		marks: localMarks(db),
		async erase() {
			// Stop first, so no tick writes into a database that is going away
			clearInterval(timer);
			agent.stop();
			db.close();
			await deleteLocalDb(env.factory, DATABASE_NAME);
			channel?.postMessage({ type: 'reload' } satisfies LocalMessage);
		}
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
