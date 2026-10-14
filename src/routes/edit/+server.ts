import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';
import { tasks } from '#lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { TaskStatus } from '#lib/types.js';

const statuses = Object.values(TaskStatus);

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const { title, description, duration, startTime, priority, status } = await request.json();

	const newTask = await db
		.insert(tasks)
		.values({
			title,
			description,
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
	const { id, title, description, duration, startTime, priority, status } = await request.json();
	const taskId = parseInt(id as string);

	if (isNaN(taskId)) {
		return Response.json(false);
	}

	await db
		.update(tasks)
		.set({
			title,
			description,
			duration,
			startTime,
			priority,
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
