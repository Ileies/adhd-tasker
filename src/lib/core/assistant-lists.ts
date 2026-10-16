/**
 * The assistant's tools for to-dos and routines (`docs/flow-plan.md` 9). They run the same rules as the screens
 * (`core/todos.ts`, `core/routines.ts`), only the origin is the agent, so a change is logged for Undo and never wakes the
 * agent again. The assistant never sets a to-do's progress and never decides what is current: the engine picks, the user
 * answers, the assistant helps with sizes, dates and words.
 */
import { summarizeAction } from '#lib/activity.js';
import {
	parseAddRoutine,
	parseAddTodo,
	parseDeleteById,
	parseUpdateRoutine,
	parseUpdateTodo
} from '#lib/assistant-tools.js';
import type { Change } from '#lib/core/assistant.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit } from '#lib/core/events.js';
import type { Routine, Subject, Todo } from '#lib/core/repo.js';
import { createRoutine, deleteRoutine, updateRoutine } from '#lib/core/routines.js';
import { createTodo, deleteTodo, updateTodo } from '#lib/core/todos.js';
import { describeTodoChange } from '#lib/events.js';
import { formatClock24, formatMinutes } from '#lib/format.js';
import { repeatText } from '#lib/schedule.js';

type Args = Record<string, unknown>;
type RecordFn = (tool: string, before: Subject | null, after: Subject | null) => Promise<number>;

/** The most lines the model is given of either list, the rest is one `list_todos` away. */
export const MAX_LISTED = 40;

/** One line of a to-do for the model. The title is the user's data. */
export function describeTodo(todo: Todo): string {
	const facts = [
		todo.estimate === null ? 'size unknown' : `size ${formatMinutes(todo.estimate)}`,
		`${todo.progress} % done`,
		...(todo.dueDate
			? [`due ${todo.dueDate}${todo.dueTime === null ? '' : ` ${formatClock24(todo.dueTime)}`}`]
			: []),
		...(todo.parentId === null ? [] : [`prepares for #${todo.parentId}`]),
		...(todo.nextStep ? [`next step: ${todo.nextStep}`] : [])
	];
	return `#${todo.id} P${todo.priority} ${todo.title} (${facts.join(', ')})`;
}

/** One line of a routine for the model. */
export function describeRoutine(routine: Routine): string {
	const end = routine.lastDay ? `, until ${routine.lastDay}` : '';
	const moves = routine.shift > 0 ? `, may move ${routine.shift} min` : '';
	const kind = routine.kind === 'appointment' ? ' (appointment)' : '';
	return `#${routine.id} ${repeatText(routine.repeat).toLowerCase()} ${formatClock24(routine.startTime)}-${formatClock24(routine.startTime + routine.duration)} P${routine.priority} ${routine.title}${kind}${moves}${end}`;
}

/** The open to-dos as lines, newest last, with a note when some are left out. */
export async function todoLines(ctx: Ctx): Promise<string[]> {
	const open = await ctx.repo.todos.open();
	const lines = open.slice(0, MAX_LISTED).map(describeTodo);
	return open.length > MAX_LISTED
		? [...lines, `and ${open.length - MAX_LISTED} more, use list_todos`]
		: lines;
}

export async function routineLines(ctx: Ctx): Promise<string[]> {
	const all = await ctx.repo.routines.all();
	const lines = all.slice(0, MAX_LISTED).map(describeRoutine);
	return all.length > MAX_LISTED
		? [...lines, `and ${all.length - MAX_LISTED} more, use list_routines`]
		: lines;
}

/** A rule the user would see as a message is the model's error to read, anything else is a bug and stays one. */
export function reasonOf(error: unknown): { error: string } {
	if (error instanceof AssistantError) return { error: error.message };
	throw error;
}

const LIST_TOOLS = [
	'list_todos',
	'add_todo',
	'update_todo',
	'delete_todo',
	'list_routines',
	'add_routine',
	'update_routine',
	'delete_routine'
];
export const isListTool = (name: string) => LIST_TOOLS.includes(name);

/** Runs one to-do or routine tool. Every change is logged (`record`) and listed for the chat (`changes`). */
export async function runListTool(
	ctx: Ctx,
	name: string,
	args: Args,
	record: RecordFn,
	changes: Change[]
): Promise<unknown> {
	const logged = async (tool: string, before: Subject | null, after: Subject | null) => {
		const id = await record(tool, before, after);
		changes.push({ id, summary: summarizeAction(tool, before, after), dates: [] });
	};

	try {
		switch (name) {
			case 'list_todos':
				return { todos: (await ctx.repo.todos.open()).map(describeTodo) };
			case 'add_todo': {
				const parsed = parseAddTodo(args);
				if (!parsed.ok) return { error: parsed.error };
				const todo = await createTodo(ctx, parsed.value, 'agent');
				await logged('add_todo', null, todo);
				return { added: describeTodo(todo) };
			}
			case 'update_todo': {
				const parsed = parseUpdateTodo(args);
				if (!parsed.ok) return { error: parsed.error };
				const before = await ctx.repo.todos.get(parsed.value.id as number);
				if (!before) return { error: 'no such to-do' };
				const after = await updateTodo(ctx, parsed.value, 'agent');
				await logged('update_todo', before, after);
				return { updated: describeTodo(after) };
			}
			case 'delete_todo': {
				const parsed = parseDeleteById(args, 'todo');
				if (!parsed.ok) return { error: parsed.error };
				const before = await deleteTodo(ctx, parsed.value, 'agent');
				await logged('delete_todo', before, null);
				return { deleted: describeTodo(before) };
			}
			case 'list_routines':
				return { routines: (await ctx.repo.routines.all()).map(describeRoutine) };
			case 'add_routine': {
				const parsed = parseAddRoutine(args);
				if (!parsed.ok) return { error: parsed.error };
				const routine = await createRoutine(ctx, parsed.value);
				await logged('add_routine', null, routine);
				return { added: describeRoutine(routine) };
			}
			case 'update_routine': {
				const parsed = parseUpdateRoutine(args);
				if (!parsed.ok) return { error: parsed.error };
				const before = await ctx.repo.routines.get(parsed.value.id as number);
				if (!before) return { error: 'no such routine' };
				const after = await updateRoutine(ctx, parsed.value);
				await logged('update_routine', before, after);
				return { updated: describeRoutine(after) };
			}
			case 'delete_routine': {
				const parsed = parseDeleteById(args, 'routine');
				if (!parsed.ok) return { error: parsed.error };
				const before = await deleteRoutine(ctx, parsed.value);
				await logged('delete_routine', before, null);
				return { deleted: describeRoutine(before) };
			}
			default:
				return { error: 'unknown tool' };
		}
	} catch (error) {
		return reasonOf(error);
	}
}

/** Logs the undo of a to-do change like the change itself: the user's doing, said to be an undo of the assistant's. */
async function emitUndo(ctx: Ctx, before: Todo | null, after: Todo | null) {
	const change = describeTodoChange(before, after);
	if (change) await emit(ctx, change.type, { ...change.payload, undoOfAgentChange: true }, 'user');
}

/**
 * Puts back what a to-do or routine tool changed: `before` and `after` are what it was and became. Answers whether the
 * tool was one of these, so the caller can go on with the task tools.
 */
export async function undoListTool(
	ctx: Ctx,
	tool: string,
	before: Subject | null,
	after: Subject | null
): Promise<boolean> {
	switch (tool) {
		case 'add_todo':
			if (after) await emitUndo(ctx, await ctx.repo.todos.delete(after.id), null);
			return true;
		case 'update_todo':
			if (before && after) {
				const { id, createdAt: _createdAt, ...fields } = before as Todo;
				const restored = await ctx.repo.todos.update(id, fields);
				await emitUndo(ctx, after as Todo, restored);
			}
			return true;
		case 'delete_todo':
			if (before) {
				await ctx.repo.todos.restore(before as Todo);
				await emitUndo(ctx, null, before as Todo);
			}
			return true;
		case 'add_routine':
			if (after) await deleteRoutine(ctx, { id: after.id }).catch(ignoreMissing);
			return true;
		case 'update_routine':
			// The same edit with the old values, its days follow like they did the first time
			if (before && after) await updateRoutine(ctx, before).catch(ignoreMissing);
			return true;
		case 'delete_routine':
			if (before) await createRoutine(ctx, before);
			return true;
		default:
			return false;
	}
}

/** Undoing what was changed again meanwhile (the routine is gone) leaves nothing to put back. */
function ignoreMissing(error: unknown) {
	if (!(error instanceof AssistantError && error.status === 404)) throw error;
}
