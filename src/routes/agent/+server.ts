import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { agentActions, agentCards } from '#lib/server/db/schema.js';
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import type { Task } from '#lib/types.js';

/**
 * What the agent did on its own since the client last asked: the open card for the Now screen, and
 * plan changes made by reactions (not by chat, the chat shows its own). `since` is the last action id the client saw,
 * without it only the cursor is returned. Phase 7 replaces this poll with a pushed stream.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const email = locals.user.email;
	const since = Number(url.searchParams.get('since'));

	const cards = await db
		.select()
		.from(agentCards)
		.where(and(eq(agentCards.email, email), isNull(agentCards.resolvedAt)))
		.orderBy(desc(agentCards.id))
		.limit(1);

	const [latest] = await db
		.select({ id: agentActions.id })
		.from(agentActions)
		.where(eq(agentActions.email, email))
		.orderBy(desc(agentActions.id))
		.limit(1);
	const cursor = latest?.id ?? 0;

	const fresh =
		Number.isInteger(since) && url.searchParams.has('since')
			? await db
					.select()
					.from(agentActions)
					.where(
						and(
							eq(agentActions.email, email),
							gt(agentActions.id, since),
							isNotNull(agentActions.eventId),
							isNull(agentActions.undoneAt)
						)
					)
					.orderBy(agentActions.id)
			: [];

	return Response.json({
		cursor,
		cards: cards.map(({ id, kind, text, options }) => ({ id, kind, text, options: options ?? [] })),
		changes: fresh.map((row) => {
			const before = row.before as Task | null;
			const after = row.after as Task | null;
			return {
				id: row.id,
				summary: summarizeAction(row.tool, before, after),
				dates: datesOfAction(before, after)
			};
		})
	});
};
