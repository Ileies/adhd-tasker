import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';
import { tasks } from '#lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { TaskStatus } from '#lib/types.js';
import { isDateKey } from '#lib/time.js';
import { emitChange } from '#lib/server/events.js';
import { fitsInDay, parseTaskId, parseTaskInput } from '#lib/task-input.js';

/** The JSON body of a request, an empty object when it is missing or not JSON. */
const readBody = (request: Request) => request.json().catch(() => ({}));

/** All tasks of one day, for days the layout did not preload. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	const rows = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.email, locals.user.email), eq(tasks.date, date)));
	return Response.json(rows);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const parsed = parseTaskInput(await readBody(request), 'create');
	if (!parsed.ok) error(400, parsed.error);
	const fields = parsed.value;

	const [created] = await db
		.insert(tasks)
		.values({
			title: fields.title!,
			description: fields.description!,
			date: fields.date!,
			startTime: fields.startTime!,
			duration: fields.duration!,
			priority: fields.priority!,
			email: locals.user.email,
			...(fields.status && { status: fields.status as TaskStatus })
		})
		.returning();

	await emitChange(locals.user.email, null, created, 'user');
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

	const owned = and(eq(tasks.id, taskId), eq(tasks.email, locals.user.email));
	const [before] = await db.select().from(tasks).where(owned);
	if (!before) error(404, 'Task not found');
	// A start or a duration alone can still push the task over midnight together with the saved other one
	if (!fitsInDay({ ...before, ...patch }))
		error(400, 'tasks cannot cross midnight, split the task');

	const [after] = await db
		.update(tasks)
		.set({ ...patch, status: patch.status as TaskStatus | undefined })
		.where(owned)
		.returning();

	await emitChange(locals.user.email, before, after, 'user');
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const taskId = parseTaskId((await readBody(request)).id);
	if (taskId === undefined) error(400, 'id must be a task id');

	const [before] = await db
		.delete(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.email, locals.user.email)))
		.returning();
	if (!before) error(404, 'Task not found');
	await emitChange(locals.user.email, before, null, 'user');
	return Response.json(true);
};
