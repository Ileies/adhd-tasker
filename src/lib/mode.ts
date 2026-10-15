/**
 * Which backend the page runs on, decided once when it loads. A signed in visitor talks to this
 * server (the layout load already carries their plan and settings). A guest talks to their own
 * device: the plan is read from IndexedDB, and the guest's agent, alarms and sound run here (D4, D8).
 */
import { pollAgent } from '#lib/agent.js';
import { deviceId, loadSchedule } from '#lib/alarms.js';
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import type { Task } from '#lib/core/repo.js';
import { deferredBackend } from '#lib/local/deferred.js';
import { startLocalRuntime } from '#lib/local/runtime.js';
import { remoteBackend } from '#lib/remote-backend.js';
import type { ClientSettings } from '#lib/settings.js';
import { handleHint } from '#lib/stream.js';
import { addDays, deviceTimezone, todayIn } from '#lib/time.js';

/** A tab that is not the leading one of a guest's device: it follows and never makes sound. */
const FOLLOWER = 'follower';

export const STORAGE_PROBLEM =
	'This browser does not let the app keep your plan on this device. Allow site data for this page, or sign in to keep your plan on the server.';

export function useAccount(email: string, settings: ClientSettings, tasks: Task[]) {
	tasker.backend = remoteBackend;
	tasker.account.email = email;
	tasker.settings = settings;
	tasker.tasks = tasks;
	tasker.account.ready = true;
}

/**
 * Starts the guest's device. It returns at once with a backend that makes every call wait for the
 * database (a screen that opens first asks for its day before IndexedDB answered), and hands over the
 * real one when it is open. Returns the cleanup. When the browser refuses storage the page says so
 * (`account.problem`) instead of showing a plan that would vanish.
 */
export function beginGuest(): () => void {
	tasker.account.email = null;
	tasker.device.id = deviceId();
	tasker.device.display = FOLLOWER;

	const opened = startLocalRuntime({
		handle: handleHint,
		onLeader: (leading) => (tasker.device.display = leading ? tasker.device.id : FOLLOWER)
	});
	tasker.backend = deferredBackend(
		opened.then(
			(runtime) => runtime.backend,
			() => Promise.reject(new BackendError(STORAGE_PROBLEM, 503))
		)
	);

	let stopped = false;
	let stop = () => {};
	opened
		.then(async (runtime) => {
			if (stopped) return runtime.stop();
			stop = runtime.stop;
			tasker.backend = runtime.backend;
			tasker.settings = await runtime.backend.settings.load();
			// From yesterday on, like the layout load of an account, so the Plan screen has its neighbours
			const from = addDays(todayIn(tasker.settings.timezone ?? deviceTimezone()), -1);
			tasker.tasks = await runtime.backend.tasks.since(from);
			tasker.sample = await runtime.backend.sample.ids();
			tasker.account.ready = true;
			void pollAgent().catch(() => {});
			void loadSchedule().catch(() => {});
		})
		.catch((error) => {
			console.error('[guest] storage failed', error);
			tasker.account.problem = STORAGE_PROBLEM;
			tasker.account.ready = true;
		});

	return () => {
		stopped = true;
		stop();
	};
}
