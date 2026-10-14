import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';
import { tasks } from '#lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { TaskStatus } from '#lib/types.js';
import { isDateKey } from '#lib/time.js';

const statuses = Object.values(TaskStatus);

/** All tasks of one day, for days the layout did not preload. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	const rows = await db.select().from(tasks).where(and(eq(tasks.email, locals.user.email), eq(tasks.date, date)));
	return Response.json(rows);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const { title, description, date, duration, startTime, priority, status } = await request.json();
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');

	const newTask = await db
		.insert(tasks)
		.values({
			title,
			description,
			date,
			duration,
			email: locals.user.email,
			startTime,
			priority,
			...(statuses.includes(status) && { status })
		})
		.returning();

	return Response.json(newTask[0]);
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const { id, title, description, date, duration, startTime, priority, status } = await request.json();
	const taskId = parseInt(id as string);

	if (isNaN(taskId)) {
		return Response.json(false);
	}
	if (date !== undefined && !isDateKey(date)) error(400, 'date must be YYYY-MM-DD');

	await db
		.update(tasks)
		.set({
			title,
			description,
			duration,
			startTime,
			priority,
			...(date !== undefined && { date }),
			...(statuses.includes(status) && { status })
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.email, locals.user.email)));
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const { id } = await request.json();
	const taskId = parseInt(id as string);

	if (isNaN(taskId)) {
		return Response.json(false);
	}

	await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.email, locals.user.email)));
	return Response.json(true);
};
