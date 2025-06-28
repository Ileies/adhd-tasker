import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';
import { tasks } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { title, description, duration, startTime, priority } = await request.json();
	
	const newTask = await db
		.insert(tasks)
		.values({
			title,
			description,
			duration,
			email: locals.user!.email,
			startTime,
			priority
		})
		.returning();

	return json(newTask[0]);
};

export const PUT: RequestHandler = async (event) => {
	const { id, title, description, duration, startTime, priority } = await event.request.json();
	const taskId = parseInt(id as string);

	if (isNaN(taskId)) {
		return json(false);
	}

	await db
		.update(tasks)
		.set({
			title,
			description,
			duration,
			startTime,
			priority
		})
		.where(eq(tasks.id, taskId));
	return json(true);
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	const taskId = parseInt(id as string);

	if (isNaN(taskId)) {
		return json(false);
	}

	await db.delete(tasks).where(eq(tasks.id, taskId));
	return json(true);
};
