/**
 * The client side of appointments (`docs/flow-plan.md` 5.10): adding the travel and the preparation the prep sheet
 * asked for, and deleting a task with an Undo that brings an appointment back together with its travel and preparation.
 * The rules that keep them together live in `core/appointments.ts`, this only keeps the screens in step.
 */
import { tasker } from '#lib/app.svelte.js';
import type { PrepStep } from '#lib/assistant-tools.js';
import type { Task, Todo } from '#lib/core/repo.js';
import { prepOf, prepPlan, prepSummary, travelOf, type PrepForm } from '#lib/prep.js';
import { createTask, deleteTask } from '#lib/tasks.js';
import { errorText, showToast } from '#lib/toast.js';
import { addTodo, changeTodo, removeTodo } from '#lib/todos.js';

/**
 * Makes what the prep sheet asked for: the travel task and the to-dos of the appointment. Says what was added with an
 * Undo, and why the travel was left out when it did not fit. Answers whether anything was added.
 */
export async function addPreparation(appointment: Task, form: PrepForm): Promise<boolean> {
	const plan = prepPlan(appointment, form, tasker.settings.arriveEarlyMinutes);
	const madeTasks: Task[] = [];
	const madeTodos: Todo[] = [];
	try {
		if (plan.travel) madeTasks.push(await createTask(plan.travel));
		for (const todo of plan.todos) madeTodos.push(await addTodo(todo));
	} catch (error) {
		showToast(errorText(error, 'Could not add the preparation'));
		return false;
	}
	const said = prepSummary(plan, appointment.title);
	if (!said) {
		if (plan.problem) showToast(plan.problem);
		return false;
	}
	showToast(plan.problem ? `${said}. ${plan.problem}` : said, async () => {
		for (const task of madeTasks) await deleteTask(task);
		for (const todo of madeTodos) await removeTodo(todo);
	});
	return true;
}

/**
 * Asks the assistant for the steps that prepare for an appointment. Nothing is written: the sheet shows them for the
 * user to edit, and Add makes what is left. Answers `null` after a toast says why it did not work.
 */
export async function suggestSteps(appointment: Task): Promise<PrepStep[] | null> {
	try {
		return (await tasker.backend.assistant.suggestPrep(appointment.id)).steps;
	} catch (error) {
		showToast(errorText(error, 'Could not get suggestions'));
		return null;
	}
}

/**
 * Deletes a task, with an Undo toast. An appointment takes its travel along and leaves its preparation due when it
 * was (the rules do that), so undoing it brings the appointment back under a new id and puts the travel and the
 * preparation back with it.
 */
export async function dropTask(task: Task, verb = 'Deleted') {
	const { id: _id, ...rest } = task;
	const travel = task.kind === 'appointment' ? travelOf(tasker.tasks, task.id) : undefined;
	const prep = task.kind === 'appointment' ? prepOf(tasker.todos, task.id) : [];
	if (!(await deleteTask(task))) return false;
	showToast(`${verb}: ${task.title}`, async () => {
		const again = await createTask(rest);
		if (travel) {
			const { id: _travelId, ...travelRest } = travel;
			await createTask({ ...travelRest, parentId: again.id });
		}
		for (const todo of prep)
			await changeTodo({ id: todo.id, parentId: again.id, description: todo.description });
	});
	return true;
}
