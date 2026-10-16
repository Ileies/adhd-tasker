import type { NewTask, Task } from '#lib/core/repo.js';
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

export async function createTask(taskData: NewTask) {
	try {
		tasker.tasks = [...tasker.tasks, await tasker.backend.tasks.create(taskData)];
	} catch (error) {
		throw new Error(`Could not add the task: ${reasonOf(error)}`, { cause: error });
	}
}

/**
 * Adds what the quick add line says to `date` and tells the user how it went. `now` is the minute of the day
 * when planning today. Answers whether a task was added, a line without a title adds nothing and says nothing.
 */
export async function addQuickTask(
	text: string,
	date: string,
	now: number | null,
	today: string = date
) {
	const task = quickTask(text, date, now, today);
	if (!task) return false;
	try {
		await createTask(task);
		showToast(
			task.date === date
				? `Added ${task.title} at ${formatClock(task.startTime)}`
				: `Added ${task.title} on ${formatDay(task.date, today)} at ${formatClock(task.startTime)}`
		);
		return true;
	} catch (error) {
		showToast(errorText(error, 'Could not add the task'));
		return false;
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
		return true;
	} catch (error) {
		const back = tasker.tasks.findIndex((t) => t.id === taskData.id);
		if (back !== -1) tasker.tasks[back] = previous;
		showToast(`Could not save ${previous.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Removes the task at once. When the backend refuses, it comes back in its place. */
export async function deleteTask(task: Task) {
	const index = tasker.tasks.findIndex((t) => t.id === task.id);
	tasker.tasks = tasker.tasks.filter((t) => t.id !== task.id);

	try {
		await tasker.backend.tasks.delete(task.id);
		return true;
	} catch (error) {
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
