/**
 * What the first run does in the page: remember what this device was told, try the sample day, clear it
 * again. The rules (when to show what) are in `firstrun.ts`, the sample's tasks in `core/sample.ts`.
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import type { Routine } from '#lib/core/repo.js';
import { essentialRoutines, type EssentialKey } from '#lib/essentials.js';
import { clearFlag, readFlags, setFlag } from '#lib/flags.js';
import { loadRoutines, reloadRoutines } from '#lib/routines.js';
import { loadTodos } from '#lib/todos.js';
import type { DateKey } from '#lib/time.js';
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
function reopenWelcome() {
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
		// The week is routines and to-dos too, the Routines sheet and the To do panel list them
		await loadRoutines().catch(() => {});
		await loadTodos().catch(() => {});
	} catch (error) {
		showToast(`Could not add the sample week: ${reasonOf(error)}`);
	}
}

/**
 * The first run's essentials: a daily routine for each one that has a time (meds, meals, bed). Counts as answering the
 * welcome. One toast with one Undo for all of them, what could not be made is said.
 */
export async function addEssentials(
	times: Partial<Record<EssentialKey, number | null>>,
	today: DateKey,
	minutes: number
) {
	answerWelcome();
	const made: Routine[] = [];
	try {
		for (const patch of essentialRoutines(times, { today, minutes }))
			made.push(await tasker.backend.routines.create(patch));
	} catch (error) {
		showToast(`Could not add the essentials: ${reasonOf(error)}`);
	}
	await reloadRoutines().catch(() => {});
	if (made.length === 0) return;
	showToast(`Added ${made.length} daily routines`, async () => {
		try {
			for (const routine of made) await tasker.backend.routines.delete(routine.id);
			await reloadRoutines();
		} catch (error) {
			showToast(`Could not undo: ${reasonOf(error)}`);
		}
	});
}

/** The sample week becomes the user's own plan: nothing is removed, it is no longer marked as a sample. */
export async function keepSampleDay() {
	try {
		await tasker.backend.sample.keep();
		tasker.sample = [];
		showToast('The sample is your plan now');
	} catch (error) {
		showToast(`Could not keep the sample week: ${reasonOf(error)}`);
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
		// The sample's routines are gone, and with them the days they made while the page was open
		await reloadRoutines().catch(() => {});
		await loadTodos().catch(() => {});
		if (tasker.tasks.length === 0 && tasker.todos.length === 0) reopenWelcome();
		showToast('Sample week cleared');
	} catch (error) {
		showToast(`Could not clear the sample week: ${reasonOf(error)}`);
	}
}
