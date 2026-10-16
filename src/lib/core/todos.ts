/**
 * To-do edits made by the user (not by the assistant): validated, stored and emitted as events. The `/todos`
 * routes call these for an account, the local backend for a guest, so both behave alike. Failures are
 * `AssistantError`s with the reason to show and the HTTP status a route answers with.
 */
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit } from '#lib/core/events.js';
import type { Todo, TodoPatch } from '#lib/core/repo.js';
import { describeTodoChange, type EventOrigin } from '#lib/events.js';
import { hasDueTime, newTodoOf, parseTodoId, parseTodoInput } from '#lib/todo-input.js';

/** To-dos finished this long ago still come with the list: the engine needs them for today, whatever the timezone. */
export const RECENT_DONE_MS = 36 * 3_600_000;

/** Every open to-do and the ones finished recently, oldest first. */
export async function loadTodos(ctx: Ctx): Promise<Todo[]> {
	const [open, done] = await Promise.all([
		ctx.repo.todos.open(),
		ctx.repo.todos.doneSince(ctx.now() - RECENT_DONE_MS)
	]);
	return [...open, ...done].sort((a, b) => a.id - b.id);
}

async function emitTodo(ctx: Ctx, before: Todo | null, after: Todo | null, origin: EventOrigin) {
	const change = describeTodoChange(before, after);
	if (change) await emit(ctx, change.type, change.payload, origin);
}

/** The appointment a to-do prepares for has to be there. */
async function checkParent(ctx: Ctx, parentId: number | null | undefined) {
	if (parentId === undefined || parentId === null) return;
	if (!(await ctx.repo.tasks.get(parentId)))
		throw new AssistantError('The appointment this is for does not exist', 400);
}

/** Done fills the bar and stamps the time, reopening clears the stamp, nothing else touches either. */
function statusPatch(
	before: Pick<Todo, 'status'> | null,
	patch: TodoPatch,
	now: number
): TodoPatch {
	if (patch.status === undefined || patch.status === before?.status) return {};
	if (patch.status === 'done') return { completedAt: now, progress: 100 };
	return { completedAt: null };
}

/** `origin` is who caused the edit: the user's screens, or the assistant (an event that never wakes the agent). */
export async function createTodo(
	ctx: Ctx,
	body: unknown,
	origin: EventOrigin = 'user'
): Promise<Todo> {
	const parsed = parseTodoInput(body, 'create');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	await checkParent(ctx, parsed.value.parentId);

	const now = ctx.now();
	const created = await ctx.repo.todos.insert({
		...newTodoOf(parsed.value, now),
		...statusPatch(null, parsed.value, now)
	});
	await emitTodo(ctx, null, created, origin);
	ctx.hint({ type: 'todos' });
	return created;
}

/** `body` is the to-do with its `id` and any fields to change. */
export async function updateTodo(
	ctx: Ctx,
	body: unknown,
	origin: EventOrigin = 'user'
): Promise<Todo> {
	const id = parseTodoId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a to-do id', 400);
	const parsed = parseTodoInput(body, 'update');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);

	const before = await ctx.repo.todos.get(id);
	if (!before) throw new AssistantError('To-do not found', 404);
	// A time alone is checked against the saved date, a date that was cleared against the saved time
	if (!hasDueTime({ ...before, ...parsed.value }))
		throw new AssistantError('dueTime needs a dueDate', 400);
	await checkParent(ctx, parsed.value.parentId);

	const after = await ctx.repo.todos.update(id, {
		...parsed.value,
		...statusPatch(before, parsed.value, ctx.now())
	});
	if (!after) throw new AssistantError('To-do not found', 404);
	await emitTodo(ctx, before, after, origin);
	ctx.hint({ type: 'todos' });
	return after;
}

/** Answers the to-do as it was, so the assistant can log it for Undo. */
export async function deleteTodo(
	ctx: Ctx,
	body: unknown,
	origin: EventOrigin = 'user'
): Promise<Todo> {
	const id = parseTodoId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a to-do id', 400);
	const before = await ctx.repo.todos.delete(id);
	if (!before) throw new AssistantError('To-do not found', 404);
	await emitTodo(ctx, before, null, origin);
	ctx.hint({ type: 'todos' });
	return before;
}
