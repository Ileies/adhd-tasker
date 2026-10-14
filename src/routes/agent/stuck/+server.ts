import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findStuckReason } from '#lib/anchoring.js';
import { emit } from '#lib/core/events.js';
import { serverCtx } from '#lib/server/ctx.js';

/** "I'm stuck": logs the event, the agent may answer with a card. The fixed hint on screen does not depend on this call. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const body: { taskId?: unknown; reason?: unknown } | null = await request
		.json()
		.catch(() => null);
	const reason = findStuckReason(body?.reason);
	if (!reason || typeof body?.taskId !== 'number')
		error(400, 'taskId and a known reason are needed');

	const ctx = serverCtx(locals.user.email);
	const task = await ctx.repo.tasks.get(body.taskId);
	if (!task) error(404, 'No such task');

	await emit(
		ctx,
		'stuck.pressed',
		{ taskId: task.id, title: task.title, reason: reason.label },
		'user'
	);
	return Response.json({ ok: true });
};
