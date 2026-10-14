import type { tasks } from '#lib/server/db/schema.js';
import type { Task } from '#lib/types.js';
import { tasker } from '#lib/app.svelte.js';
import { showToast } from '#lib/toast.js';

/** What the server said was wrong, or the plain reason when it could not be reached. */
async function reasonOf(response: Response | null) {
	if (!response) return 'no connection';
	const body = await response.json().catch(() => null);
	return typeof body?.message === 'string' ? body.message : `error ${response.status}`;
}

/** Sends one change to `/edit`. Null means the server could not be reached. */
async function send(method: 'POST' | 'PUT' | 'DELETE', body: unknown) {
	try {
		return await fetch('/edit', {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		return null;
	}
}

export async function createTask(taskData: typeof tasks.$inferInsert) {
	const response = await send('POST', taskData);
	if (!response?.ok) throw new Error(`Could not add the task: ${await reasonOf(response)}`);
	tasker.tasks = [...tasker.tasks, await response.json()];
}

/** Shows the change at once. When the server refuses, the task goes back and a toast says why. */
export async function updateTask(taskData: Task) {
	const index = tasker.tasks.findIndex((t) => t.id === taskData.id);
	if (index === -1) return false;
	const previous = tasker.tasks[index];
	tasker.tasks[index] = { ...taskData };

	const response = await send('PUT', taskData);
	if (response?.ok) return true;
	const back = tasker.tasks.findIndex((t) => t.id === taskData.id);
	if (back !== -1) tasker.tasks[back] = previous;
	showToast(`Could not save ${previous.title}: ${await reasonOf(response)}`);
	return false;
}

/** Removes the task at once. When the server refuses, it comes back in its place. */
export async function deleteTask(task: Task) {
	const index = tasker.tasks.findIndex((t) => t.id === task.id);
	tasker.tasks = tasker.tasks.filter((t) => t.id !== task.id);

	const response = await send('DELETE', { id: task.id });
	if (response?.ok) return true;
	if (index !== -1 && !tasker.tasks.some((t) => t.id === task.id))
		tasker.tasks = tasker.tasks.toSpliced(index, 0, task);
	showToast(`Could not delete ${task.title}: ${await reasonOf(response)}`);
	return false;
}

/** Fetches every task of one day, replacing what the client holds for that day. */
export async function loadDay(date: string) {
	const response = await fetch(`/edit?date=${date}`);
	if (!response.ok) throw new Error('Failed to load day');
	const day: Task[] = await response.json();
	tasker.tasks = [...tasker.tasks.filter((t) => t.date !== date), ...day];
}
