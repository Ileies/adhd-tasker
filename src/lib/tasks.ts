import type { NewTask, Task, TaskKind } from '#lib/core/repo.js';
import { BackendError } from '#lib/backend.js';
import { tasker } from '#lib/app.svelte.js';
import { formatClock } from '#lib/format.js';
import { quickTask } from '#lib/quickadd.js';
import { formatDay } from '#lib/time.js';
import { errorText, showToast } from '#lib/toast.js';

/** What the backend said was wrong, or the plain reason when it could not be reached. */
const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null
		? 'no connection'
		: error instanceof Error
			? error.message
			: String(error);

/** Adds a task and answers it as the backend stored it. */
export async function createTask(taskData: NewTask): Promise<Task> {
	try {
		const created = await tasker.backend.tasks.create(taskData);
		tasker.tasks = [...tasker.tasks, created];
		return created;
	} catch (error) {
		throw new Error(`Could not add the task: ${reasonOf(error)}`, { cause: error });
	}
}

/**
 * Adds what the quick add line says to `date` and tells the user how it went. `now` is the minute of the day
 * when planning today, `chosen` the kind the user tapped (the words decide otherwise). Answers the task that was
 * added, `null` for a line without a title (which says nothing) and for one that failed (which says why).
 */
export async function addQuickTask(
	text: string,
	date: string,
	now: number | null,
	today: string = date,
	chosen: TaskKind | null = null
): Promise<Task | null> {
	const task = quickTask(text, date, now, today, chosen);
	if (!task) return null;
	try {
		const created = await createTask(task);
		showToast(
			task.date === date
				? `Added ${task.title} at ${formatClock(task.startTime)}`
				: `Added ${task.title} on ${formatDay(task.date, today)} at ${formatClock(task.startTime)}`
		);
		return created;
	} catch (error) {
		showToast(errorText(error, 'Could not add the task'));
		return null;
	}
}

/** Shows the change at once. When the backend refuses, the task goes back and a toast says why. */
export async function updateTask(taskData: Task) {
	const index = tasker.tasks.findIndex((t) => t.id === taskData.id);
	if (index === -1) return false;
	const previous = tasker.tasks[index];
	tasker.tasks[index] = { ...taskData };

	try {
		await tasker.backend.tasks.update(taskData);
		// The rules moved its travel and preparation along, the screens read them again
		if (previous.kind === 'appointment' && travelsAlong(previous, taskData))
			await refreshAppointments([previous.date, taskData.date]);
		return true;
	} catch (error) {
		const back = tasker.tasks.findIndex((t) => t.id === taskData.id);
		if (back !== -1) tasker.tasks[back] = previous;
		showToast(`Could not save ${previous.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Whether an edit of an appointment moves its travel or preparation, or lets go of them. */
const travelsAlong = (before: Task, after: Task) =>
	before.date !== after.date || before.startTime !== after.startTime || before.kind !== after.kind;

/** Reads the days and the to-dos again after an appointment changed what depends on it. Quiet when that fails. */
async function refreshAppointments(dates: string[]) {
	try {
		await Promise.all([...new Set(dates)].map(loadDay));
		tasker.todos = await tasker.backend.todos.load();
	} catch {
		// The next load of the day and the next hint set it right
	}
}

/** Removes the task at once. When the backend refuses, it comes back in its place. */
export async function deleteTask(task: Task) {
	const index = tasker.tasks.findIndex((t) => t.id === task.id);
	tasker.tasks = tasker.tasks.filter(
		(t) => t.id !== task.id && !(task.kind === 'appointment' && t.parentId === task.id)
	);

	try {
		await tasker.backend.tasks.delete(task.id);
		if (task.kind === 'appointment') await refreshAppointments([task.date]);
		return true;
	} catch (error) {
		if (task.kind === 'appointment') await refreshAppointments([task.date]);
		if (index !== -1 && !tasker.tasks.some((t) => t.id === task.id))
			tasker.tasks = tasker.tasks.toSpliced(index, 0, task);
		showToast(`Could not delete ${task.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Fetches every task of one day, replacing what the client holds for that day. */
export async function loadDay(date: string) {
	let day: Task[];
	try {
		day = await tasker.backend.tasks.load(date);
	} catch (error) {
		throw new Error(`Could not load this day: ${reasonOf(error)}`, { cause: error });
	}
	tasker.tasks = [...tasker.tasks.filter((t) => t.date !== date), ...day];
}
