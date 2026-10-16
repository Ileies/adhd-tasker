/**
 * The client side of routines: what the screens hold in `tasker.routines`, and the plan days a routine made, which
 * are ordinary tasks in `tasker.tasks` that the backend makes and moves along (`core/routines.ts`). Every change
 * says what it did and offers an Undo, never a confirm dialog.
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import type { Routine, RoutinePatch } from '#lib/core/repo.js';
import { repeatText } from '#lib/schedule.js';
import { addDays, deviceTimezone, todayIn } from '#lib/time.js';
import { errorText, showToast } from '#lib/toast.js';

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null ? 'no connection' : errorText(error, '');

/** The routine fields an Undo of a change puts back: the old value of each field the change named. */
export function undoPatch(routine: Routine, change: RoutinePatch): RoutinePatch {
	const old: Record<string, unknown> = {};
	for (const key of Object.keys(change) as (keyof RoutinePatch)[])
		if (key !== 'through') old[key] = routine[key];
	return old as RoutinePatch;
}

/** A routine as the backend stores it, in the list in its place (oldest first). */
function keep(routine: Routine) {
	const index = tasker.routines.findIndex((entry) => entry.id === routine.id);
	tasker.routines =
		index === -1
			? [...tasker.routines, routine]
			: tasker.routines.map((entry) => (entry.id === routine.id ? routine : entry));
}

/** Fetches every routine. */
export async function loadRoutines() {
	try {
		tasker.routines = await tasker.backend.routines.load();
	} catch (error) {
		throw new Error(`Could not load the routines: ${reasonOf(error)}`, { cause: error });
	}
}

/**
 * Reads the days from yesterday on again, the ones a routine made or changed. Days before stay as they are, the
 * Plan screen fetches those itself.
 */
export async function loadRoutineDays() {
	const from = addDays(
		todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone()),
		-1
	);
	const fresh = await tasker.backend.tasks.since(from);
	tasker.tasks = [...tasker.tasks.filter((task) => task.date < from), ...fresh];
}

/** What an open screen does when a hint says a routine changed or the tick made days. Quiet when it fails. */
export async function reloadRoutines() {
	await Promise.all([loadRoutines(), loadRoutineDays()]);
}

/** Puts back what a change or a removal did, without another toast. Says why when it cannot. */
async function putBack(work: () => Promise<Routine>) {
	try {
		keep(await work());
		await loadRoutineDays();
	} catch (error) {
		showToast(`Could not undo: ${reasonOf(error)}`);
	}
}

/** Makes a routine and its next 14 days. Rejects with the reason, the caller decides how to say it. */
export async function addRoutine(fields: RoutinePatch): Promise<Routine> {
	let created: Routine;
	try {
		created = await tasker.backend.routines.create(fields);
		keep(created);
		await loadRoutineDays();
	} catch (error) {
		throw new Error(`Could not add the routine: ${reasonOf(error)}`, { cause: error });
	}
	showToast(`Added ${created.title}, ${repeatText(created.repeat).toLowerCase()}`, async () => {
		try {
			await tasker.backend.routines.delete(created.id);
			tasker.routines = tasker.routines.filter((routine) => routine.id !== created.id);
			await loadRoutineDays();
		} catch (error) {
			showToast(`Could not undo: ${reasonOf(error)}`);
		}
	});
	return created;
}

/**
 * Changes a routine, its days from today on follow (a day the user changed or finished keeps its changes). Answers the
 * stored routine, `null` when it failed (a toast says why). The Undo is the change back.
 */
export async function changeRoutine(
	fields: RoutinePatch & { id: number },
	say?: string
): Promise<Routine | null> {
	const previous = tasker.routines.find((routine) => routine.id === fields.id);
	if (!previous) return null;
	const { id, ...change } = fields;
	const undo = undoPatch(previous, change);
	try {
		const stored = await tasker.backend.routines.update(fields);
		keep(stored);
		await loadRoutineDays();
		showToast(say ?? `Changed ${stored.title}`, () =>
			putBack(() => tasker.backend.routines.update({ id, ...undo }))
		);
		return stored;
	} catch (error) {
		showToast(`Could not save ${previous.title}: ${reasonOf(error)}`);
		return null;
	}
}

/** Removes the routine and its days from today on that are not done. The Undo makes it again, with its days. */
export async function removeRoutine(routine: Routine): Promise<boolean> {
	try {
		const gone = await tasker.backend.routines.delete(routine.id);
		tasker.routines = tasker.routines.filter((entry) => entry.id !== routine.id);
		await loadRoutineDays();
		showToast(`Removed ${routine.title}`, () =>
			putBack(() => tasker.backend.routines.create(gone))
		);
		return true;
	} catch (error) {
		showToast(`Could not remove ${routine.title}: ${reasonOf(error)}`);
		return false;
	}
}
