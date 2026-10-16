/**
 * The client side of to-dos and the flow log: what the screens hold in `tasker.todos` and `tasker.flow`, changed
 * at once and put back with a reason when the backend refuses (like `tasks.ts`).
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type FlowAnswer } from '#lib/backend.js';
import type { FlowRow, Todo, TodoPatch } from '#lib/core/repo.js';
import { errorText, showToast } from '#lib/toast.js';
import { deviceTimezone, todayIn } from '#lib/time.js';

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null ? 'no connection' : errorText(error, '');

/** Today's date in the user's timezone, the day the flow log is read for. */
export const flowToday = () =>
	todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone());

/** Fetches every open to-do and the recently finished ones. */
export async function loadTodos() {
	try {
		tasker.todos = await tasker.backend.todos.load();
	} catch (error) {
		throw new Error(`Could not load the to-dos: ${reasonOf(error)}`, { cause: error });
	}
}

/** Adds a to-do. Rejects with the reason, the caller decides how to say it. */
export async function addTodo(fields: TodoPatch): Promise<Todo> {
	try {
		const created = await tasker.backend.todos.create(fields);
		tasker.todos = [...tasker.todos.filter((todo) => todo.id !== created.id), created];
		return created;
	} catch (error) {
		throw new Error(`Could not add the to-do: ${reasonOf(error)}`, { cause: error });
	}
}

/** Shows the change at once. When the backend refuses, the to-do goes back and a toast says why. */
export async function changeTodo(fields: TodoPatch & { id: number }) {
	const index = tasker.todos.findIndex((todo) => todo.id === fields.id);
	if (index === -1) return false;
	const previous = tasker.todos[index];
	tasker.todos[index] = {
		...previous,
		...fields,
		...(fields.status === 'done' && previous.status !== 'done' && { progress: 100 })
	};

	try {
		const stored = await tasker.backend.todos.update(fields);
		const back = tasker.todos.findIndex((todo) => todo.id === fields.id);
		if (back !== -1) tasker.todos[back] = stored;
		return true;
	} catch (error) {
		const back = tasker.todos.findIndex((todo) => todo.id === fields.id);
		if (back !== -1) tasker.todos[back] = previous;
		showToast(`Could not save ${previous.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Removes the to-do at once. When the backend refuses, it comes back in its place. */
export async function removeTodo(todo: Todo) {
	const index = tasker.todos.findIndex((entry) => entry.id === todo.id);
	tasker.todos = tasker.todos.filter((entry) => entry.id !== todo.id);

	try {
		await tasker.backend.todos.delete(todo.id);
		return true;
	} catch (error) {
		if (index !== -1 && !tasker.todos.some((entry) => entry.id === todo.id))
			tasker.todos = tasker.todos.toSpliced(index, 0, todo);
		showToast(`Could not delete ${todo.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Fetches the answers of one day (today without a date) and replaces what the client holds. */
export async function loadFlow(date: string = flowToday()) {
	try {
		tasker.flow = { date, rows: await tasker.backend.flow.load(date) };
	} catch (error) {
		throw new Error(`Could not load today's answers: ${reasonOf(error)}`, { cause: error });
	}
}

let nextLocalId = -1;

/**
 * Logs one answer and shows it at once, with a temporary negative id until the backend answers. A day that
 * rolled over meanwhile is loaded first. Answers the stored row, `null` when its key was logged already or the
 * backend refused (a toast says why).
 */
export async function recordAnswer(answer: FlowAnswer): Promise<FlowRow | null> {
	const at = answer.at ?? Date.now();
	const date = flowToday();
	if (tasker.flow.date !== date) tasker.flow = { date, rows: [] };
	const draft: FlowRow = {
		id: nextLocalId--,
		at,
		date,
		type: answer.type,
		todoId: answer.todoId ?? null,
		taskId: answer.taskId ?? null,
		data: answer.data ?? {},
		key: answer.key ?? null
	};
	tasker.flow.rows = [...tasker.flow.rows, draft];
	const without = () => tasker.flow.rows.filter((row) => row.id !== draft.id);

	try {
		const stored = await tasker.backend.flow.record({ ...answer, at });
		// A fetch that came in meanwhile (the hint of this very answer) replaced the draft with the stored row already
		const known = tasker.flow.rows.some((row) => row.id === stored?.id);
		tasker.flow.rows =
			stored && !known
				? tasker.flow.rows.some((row) => row.id === draft.id)
					? tasker.flow.rows.map((row) => (row.id === draft.id ? stored : row))
					: [...tasker.flow.rows, stored]
				: without();
		return stored;
	} catch (error) {
		tasker.flow.rows = without();
		showToast(`Could not save that: ${reasonOf(error)}`);
		return null;
	}
}
