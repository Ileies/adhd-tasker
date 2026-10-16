/**
 * What the to-do sheet and the To do panel on Plan need: the form as plain values, the patch it makes, the line
 * under a row and the order of the list. Pure.
 */
import { dueWords } from '#lib/dates.js';
import type { Task, Todo, TodoPatch } from '#lib/core/repo.js';
import { formatDuration } from '#lib/format.js';
import type { Priority } from '#lib/types.js';

/** Sizes to tap, in minutes. Anything else is typed in the free field, "unknown" is no size at all. */
export const SIZE_CHIPS = [15, 30, 60, 120, 300, 600, 1200];

export interface TodoForm {
	title: string;
	priority: Priority;
	/** Minutes, `null` when unknown. */
	estimate: number | null;
	/** `YYYY-MM-DD`, empty for none. */
	dueDate: string;
	/** Minutes since midnight, `null` for the end of My day. */
	dueTime: number | null;
	nextStep: string;
	progress: number;
	description: string;
}

export function todoFormOf(todo: Todo): TodoForm {
	return {
		title: todo.title,
		priority: todo.priority,
		estimate: todo.estimate,
		dueDate: todo.dueDate ?? '',
		dueTime: todo.dueTime,
		nextStep: todo.nextStep ?? '',
		progress: todo.progress,
		description: todo.description
	};
}

/** The change the form makes, or what is wrong with it. A time without a day is dropped: the day comes first. */
export function todoPatchOf(
	form: TodoForm
): { ok: true; patch: TodoPatch } | { ok: false; error: string } {
	const title = form.title.trim();
	if (!title) return { ok: false, error: 'Give the to-do a title' };
	if (form.estimate !== null && (!Number.isInteger(form.estimate) || form.estimate < 1))
		return { ok: false, error: 'The size must be at least 1 minute' };
	const dueDate = form.dueDate === '' ? null : form.dueDate;
	return {
		ok: true,
		patch: {
			title,
			priority: form.priority,
			estimate: form.estimate,
			dueDate,
			dueTime: dueDate === null ? null : form.dueTime,
			nextStep: form.nextStep.trim() === '' ? null : form.nextStep.trim(),
			progress: form.progress,
			description: form.description
		}
	};
}

/** The line under a row: "Due in 12 days, 4 h of about 15 h". Nothing is said about what is not known. */
export function todoLine(todo: Todo, today: string): string {
	const parts: string[] = [];
	if (todo.dueDate !== null) {
		const words = dueWords(todo.dueDate, today);
		parts.push(words === 'overdue' ? 'Overdue' : `Due ${words}`);
	}
	if (todo.estimate !== null) {
		parts.push(
			todo.spentMinutes > 0
				? `${formatDuration(todo.spentMinutes)} of about ${formatDuration(todo.estimate)}`
				: `about ${formatDuration(todo.estimate)}`
		);
	} else if (todo.progress > 0) {
		parts.push(`${todo.progress} %`);
	}
	return parts.join(', ');
}

/** An appointment with the to-dos that prepare for it. */
export interface PanelGroup {
	appointment: Pick<Task, 'id' | 'title' | 'date' | 'startTime'>;
	todos: Todo[];
}

/**
 * The panel's two parts: "For appointments" (under the appointment, the nearest first) and "Other". A to-do whose
 * appointment is not known (deleted, or too far away to be loaded) is listed with the others.
 */
export function panelGroups(
	todos: Todo[],
	tasks: Pick<Task, 'id' | 'title' | 'date' | 'startTime'>[]
): { forAppointments: PanelGroup[]; other: Todo[] } {
	const listed = panelTodos(todos);
	const known = new Map(tasks.map((task) => [task.id, task]));
	const groups = new Map<number, PanelGroup>();
	const other: Todo[] = [];
	for (const todo of listed) {
		const appointment = todo.parentId === null ? undefined : known.get(todo.parentId);
		if (!appointment) {
			other.push(todo);
			continue;
		}
		const group = groups.get(appointment.id) ?? { appointment, todos: [] };
		group.todos.push(todo);
		groups.set(appointment.id, group);
	}
	const forAppointments = [...groups.values()].sort(
		(a, b) =>
			a.appointment.date.localeCompare(b.appointment.date) ||
			a.appointment.startTime - b.appointment.startTime ||
			a.appointment.id - b.appointment.id
	);
	return { forAppointments, other };
}

/** The to-dos the panel lists: the open ones, what is due first and what matters most on top. */
export function panelTodos(todos: Todo[]): Todo[] {
	return todos
		.filter((todo) => todo.status === 'open')
		.sort(
			(a, b) =>
				(a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
				(a.dueDate === null ? 0 : (a.dueTime ?? 1440) - (b.dueTime ?? 1440)) ||
				b.priority - a.priority ||
				a.id - b.id
		);
}
