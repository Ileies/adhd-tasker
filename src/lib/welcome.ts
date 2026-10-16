/**
 * What the first run does in the page: remember what this device was told, try the sample day, clear it
 * again. The rules (when to show what) are in `firstrun.ts`, the sample's tasks in `core/sample.ts`.
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import { clearFlag, readFlags, setFlag } from '#lib/flags.js';
import { showToast } from '#lib/toast.js';

/** Reads what this device was told before. Called once when the page loads. */
export function loadFlags() {
	const flags = readFlags();
	tasker.firstRun.welcomed = flags.welcomed;
}

/** Starting for real (the tour's last button) or the sample day answers the welcome for good. */
export function answerWelcome() {
	setFlag('welcomed');
	tasker.firstRun.welcomed = true;
}

/** Shows the welcome again, as on the first visit. Only reachable while the plan is empty. */
export function reopenWelcome() {
	clearFlag('welcomed');
	tasker.firstRun.welcomed = false;
}

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null
		? 'No connection'
		: error instanceof Error
			? error.message
			: String(error);

/** Fills today with the sample day around `minutes` (since midnight). Says why when it could not. */
export async function trySampleDay(today: string, minutes: number) {
	answerWelcome();
	try {
		const created = await tasker.backend.sample.start(today, minutes);
		const ids = new Set(created.map((task) => task.id));
		tasker.tasks = [...tasker.tasks.filter((task) => !ids.has(task.id)), ...created];
		tasker.sample = [...ids];
	} catch (error) {
		showToast(`Could not add the sample day: ${reasonOf(error)}`);
	}
}

/**
 * Removes exactly the sample tasks, whatever the user planned stays. When nothing else is left the device
 * is as before the visit, so the welcome comes back and the visitor can choose again.
 */
export async function clearSampleDay() {
	try {
		await tasker.backend.sample.clear();
		const gone = new Set(tasker.sample);
		tasker.tasks = tasker.tasks.filter((task) => !gone.has(task.id));
		tasker.sample = [];
		if (tasker.tasks.length === 0) reopenWelcome();
		showToast('Sample day cleared');
	} catch (error) {
		showToast(`Could not clear the sample day: ${reasonOf(error)}`);
	}
}
