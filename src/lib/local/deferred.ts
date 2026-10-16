import type { Backend } from '#lib/backend.js';

/**
 * Every method of `Backend` by area. Spelled out on purpose: the backend lives in the one `tasker` state
 * object, where Svelte wraps it in its own proxy and only sees methods that exist as properties, so a catch-all
 * proxy here would answer `undefined`. `deferred.test.ts` checks the list against the real backend.
 */
export const BACKEND_METHODS = {
	tasks: ['load', 'since', 'create', 'update', 'delete'],
	todos: ['load', 'create', 'update', 'delete'],
	flow: ['load', 'record'],
	schedule: ['load', 'addAlarm', 'remove', 'setEnabled', 'updateAlarm', 'chooseDisplay'],
	assistant: ['chat', 'undo'],
	agent: ['feed', 'resolveCard', 'stuck'],
	activity: ['load'],
	settings: ['load', 'saveTimezone', 'searchPlaces', 'saveKey', 'removeKey', 'save'],
	data: ['export', 'import', 'erase'],
	account: ['move', 'snapshots', 'restore'],
	calendar: ['overview', 'preview', 'import', 'sync', 'stop', 'setWrite', 'allDay'],
	sample: ['ids', 'start', 'clear', 'keep'],
	voice: ['transcribe', 'speak']
} as const satisfies { [Area in keyof Backend]: readonly (keyof Backend[Area])[] };

/**
 * A backend that does not exist yet. Screens ask for the plan, the schedule or the settings the moment
 * they open, which can be before the guest's database was opened. Every call waits for `ready`
 * and then goes to the real backend, so no screen has to know about the wait. When `ready` fails the
 * calls fail with that reason.
 */
export function deferredBackend(ready: Promise<Backend>): Backend {
	// Calls that nobody awaits must not report the failure a second time
	ready.catch(() => {});
	const backend: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
	for (const [area, methods] of Object.entries(BACKEND_METHODS)) {
		backend[area] = {};
		for (const method of methods)
			backend[area][method] = async (...args) => {
				const real = (await ready) as unknown as Record<
					string,
					Record<string, (...rest: unknown[]) => Promise<unknown>>
				>;
				return real[area][method](...args);
			};
	}
	return backend as unknown as Backend;
}
