import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { agentCards } from '#lib/server/db/schema.js';

/** Dismisses or answers a card. The answer itself is sent to the chat by the client. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Login required');
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(400, 'id must be a card id');

	const done = await db
		.update(agentCards)
		.set({ resolvedAt: Date.now() })
		.where(and(eq(agentCards.id, id), eq(agentCards.email, locals.user.email), isNull(agentCards.resolvedAt)))
		.returning({ id: agentCards.id });
	if (done.length === 0) error(404, 'No such open card');
	return Response.json({ ok: true });
};
