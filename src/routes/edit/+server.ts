import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { emitChange } from '#lib/core/events.js';
import { TaskStatus } from '#lib/types.js';
import { isDateKey } from '#lib/time.js';
import { serverCtx } from '#lib/server/ctx.js';
import { fitsInDay, parseTaskId, parseTaskInput } from '#lib/task-input.js';

/** The JSON body of a request, an empty object when it is missing or not JSON. */
const readBody = (request: Request) => request.json().catch(() => ({}));

/** All tasks of one day, for days the layout did not preload. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await serverCtx(locals.user.email).repo.tasks.between(date, date));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const parsed = parseTaskInput(await readBody(request), 'create');
	if (!parsed.ok) error(400, parsed.error);
	const fields = parsed.value;

	const ctx = serverCtx(locals.user.email);
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
	return Response.json(created);
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const body = await readBody(request);
	const taskId = parseTaskId(body.id);
	if (taskId === undefined) error(400, 'id must be a task id');
	const parsed = parseTaskInput(body, 'update');
	if (!parsed.ok) error(400, parsed.error);
	const patch = parsed.value;

	const ctx = serverCtx(locals.user.email);
	const before = await ctx.repo.tasks.get(taskId);
	if (!before) error(404, 'Task not found');
	// A start or a duration alone can still push the task over midnight together with the saved other one
	if (!fitsInDay({ ...before, ...patch }))
		error(400, 'tasks cannot cross midnight, split the task');

	const after = await ctx.repo.tasks.update(taskId, {
		...patch,
		status: patch.status as TaskStatus | undefined
	});

	await emitChange(ctx, before, after, 'user');
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const taskId = parseTaskId((await readBody(request)).id);
	if (taskId === undefined) error(400, 'id must be a task id');

	const ctx = serverCtx(locals.user.email);
	const before = await ctx.repo.tasks.delete(taskId);
	if (!before) error(404, 'Task not found');
	await emitChange(ctx, before, null, 'user');
	return Response.json(true);
};
