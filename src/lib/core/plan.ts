/**
 * Plan edits made by the user (not by the assistant): validated, stored and emitted as events.
 * The `/edit` routes call these for an account, the local backend for a guest, so both behave alike.
 * Failures are `AssistantError`s with the reason to show and the HTTP status a route answers with.
 */
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emitChange } from '#lib/core/events.js';
import type { Task } from '#lib/core/repo.js';
import { fitsInDay, parseTaskId, parseTaskInput } from '#lib/task-input.js';
import { TaskStatus } from '#lib/types.js';

export async function createPlanTask(ctx: Ctx, body: unknown): Promise<Task> {
	const parsed = parseTaskInput(body, 'create');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	const fields = parsed.value;

	const created = await ctx.repo.tasks.insert({
		title: fields.title!,
		description: fields.description!,
		date: fields.date!,
		startTime: fields.startTime!,
		duration: fields.duration!,
		priority: fields.priority!,
		...(fields.status && { status: fields.status as TaskStatus })
	});
	await emitChange(ctx, null, created, 'user');
	return created;
}

/** `body` is the task with its `id` and any fields to change. */
export async function updatePlanTask(ctx: Ctx, body: unknown): Promise<void> {
	const id = parseTaskId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a task id', 400);
	const parsed = parseTaskInput(body, 'update');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	const patch = parsed.value;

	const before = await ctx.repo.tasks.get(id);
	if (!before) throw new AssistantError('Task not found', 404);
	// A start or a duration alone can still push the task over midnight together with the saved other one
	if (!fitsInDay({ ...before, ...patch }))
		throw new AssistantError('tasks cannot cross midnight, split the task', 400);

	const after = await ctx.repo.tasks.update(id, {
		...patch,
		status: patch.status as TaskStatus | undefined
	});
	await emitChange(ctx, before, after, 'user');
}

export async function deletePlanTask(ctx: Ctx, body: unknown): Promise<void> {
	const id = parseTaskId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a task id', 400);
	const before = await ctx.repo.tasks.delete(id);
	if (!before) throw new AssistantError('Task not found', 404);
	await emitChange(ctx, before, null, 'user');
}
