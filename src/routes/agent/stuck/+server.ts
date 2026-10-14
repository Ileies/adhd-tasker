import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { findStuckReason } from '#lib/anchoring.js';
import { db } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema.js';
import { emit } from '#lib/server/events.js';

/** "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this call. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const body: { taskId?: unknown; reason?: unknown } | null = await request.json().catch(() => null);
	const reason = findStuckReason(body?.reason);
	if (!reason || typeof body?.taskId !== 'number') error(400, 'taskId and a known reason are needed');

	const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, body.taskId), eq(tasks.email, locals.user.email)) });
	if (!task) error(404, 'No such task');

	await emit(locals.user.email, 'stuck.pressed', { taskId: task.id, title: task.title, reason: reason.label }, 'user');
	return Response.json({ ok: true });
};
