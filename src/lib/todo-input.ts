import { parsePriority, parseTitle, type Parsed } from '#lib/assistant-tools.js';
import type { NewTodo, TodoPatch, TodoStatus } from '#lib/core/repo.js';
import { isDateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

/** The size of a to-do in minutes: at least one, at most 500 hours. */
export const ESTIMATE_LIMITS = { min: 1, max: 30_000 } as const;
export const MAX_NEXT_STEP = 200;
export const MAX_DESCRIPTION = 1000;

/** What a user may set from the screens. `ended` is the engine's, it never comes in from outside. */
export const USER_TODO_STATUSES: readonly TodoStatus[] = ['open', 'done', 'dropped'];

const isWhole = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * What Now, Plan and `/todos` may send for a to-do. The same rules as the assistant's tools (titles, priorities),
 * so chat and the screens can never disagree. Create needs a title, update takes any subset. A `null` clears
 * an optional field. Keys the engine owns (`spentMinutes`, `skips`, `learned`) and other keys are ignored.
 */
export function parseTodoInput(body: unknown, mode: 'create' | 'update'): Parsed<TodoPatch> {
	const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const patch: TodoPatch = {};
	const fail = (error: string) => ({ ok: false as const, error });

	if (mode === 'create' || input.title !== undefined) {
		const title = parseTitle(input.title);
		if (!title) return fail('title is required (max 200 characters)');
		patch.title = title;
	}
	if (input.description !== undefined) {
		if (typeof input.description !== 'string') return fail('description must be text');
		patch.description = input.description.slice(0, MAX_DESCRIPTION);
	}
	if (input.priority !== undefined) {
		const priority = parsePriority(input.priority);
		if (priority === undefined) return fail('priority must be 1 to 5');
		patch.priority = priority;
	}
	if (input.estimate !== undefined) {
		if (
			input.estimate !== null &&
			!isWhole(input.estimate, ESTIMATE_LIMITS.min, ESTIMATE_LIMITS.max)
		)
			return fail('estimate must be whole minutes, 1 to 30000, or null');
		patch.estimate = input.estimate;
		// A size the user typed replaces one the app learned
		patch.learned = false;
	}
	if (input.progress !== undefined) {
		if (!isWhole(input.progress, 0, 100))
			return fail('progress must be a whole number from 0 to 100');
		patch.progress = input.progress;
	}
	if (input.dueDate !== undefined) {
		if (input.dueDate !== null && !isDateKey(input.dueDate))
			return fail('dueDate must be YYYY-MM-DD or null');
		patch.dueDate = input.dueDate;
	}
	if (input.dueTime !== undefined) {
		if (input.dueTime !== null && !isWhole(input.dueTime, 0, 1439))
			return fail('dueTime must be whole minutes since midnight, 0 to 1439, or null');
		patch.dueTime = input.dueTime;
	}
	if (input.notBefore !== undefined) {
		if (input.notBefore !== null && !isDateKey(input.notBefore))
			return fail('notBefore must be YYYY-MM-DD or null');
		patch.notBefore = input.notBefore;
	}
	if (input.parentId !== undefined) {
		if (input.parentId !== null && !isWhole(input.parentId, 1, Number.MAX_SAFE_INTEGER))
			return fail('parentId must be a task id or null');
		patch.parentId = input.parentId;
	}
	if (input.nextStep !== undefined) {
		if (input.nextStep !== null && typeof input.nextStep !== 'string')
			return fail('nextStep must be text or null');
		const step = typeof input.nextStep === 'string' ? input.nextStep.trim() : '';
		patch.nextStep = step ? step.slice(0, MAX_NEXT_STEP) : null;
	}
	if (input.status !== undefined) {
		if (!USER_TODO_STATUSES.includes(input.status as TodoStatus))
			return fail('status must be open, done or dropped');
		patch.status = input.status as TodoStatus;
	}

	// An update of the time alone is checked against the saved due date by the caller
	if ((mode === 'create' || patch.dueDate !== undefined) && !hasDueTime(patch))
		return fail('dueTime needs a dueDate');
	if (mode === 'update' && Object.keys(patch).length === 0) return fail('nothing to change');
	return { ok: true, value: patch };
}

/** A due time only means something with a due date. */
export const hasDueTime = (todo: Pick<TodoPatch, 'dueDate' | 'dueTime'>) =>
	todo.dueTime === undefined ||
	todo.dueTime === null ||
	(todo.dueDate !== undefined && todo.dueDate !== null);

/** The id of a to-do to change or delete, a whole number. */
export function parseTodoId(value: unknown): number | undefined {
	return isWhole(value, 1, Number.MAX_SAFE_INTEGER) ? value : undefined;
}

/** A create patch as a new to-do. */
export function newTodoOf(patch: TodoPatch, createdAt: number): NewTodo {
	return { ...patch, title: patch.title!, priority: patch.priority ?? Priority.Medium, createdAt };
}
