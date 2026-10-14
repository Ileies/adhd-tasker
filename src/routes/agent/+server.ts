import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { datesOfAction, summarizeAction } from '#lib/activity.js';
import { dbRepo } from '#lib/server/db-repo.js';

/**
 * What the agent did on its own since the client last asked: the open card for the Now screen, and
 * plan changes made by reactions (not by chat, the chat shows its own). `since` is the last action id the client saw,
 * without it only the cursor is returned. Phase 7 replaces this poll with a pushed stream.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const repo = dbRepo(locals.user.email);
	const since = Number(url.searchParams.get('since'));

	const card = await repo.cards.open();
	const cursor = await repo.actions.latestId();
	const fresh =
		Number.isInteger(since) && url.searchParams.has('since')
			? await repo.actions.ownSince(since)
			: [];

	return Response.json({
		cursor,
		cards: card
			? [{ id: card.id, kind: card.kind, text: card.text, options: card.options ?? [] }]
			: [],
		changes: fresh.map((row) => ({
			id: row.id,
			summary: summarizeAction(row.tool, row.before, row.after),
			dates: datesOfAction(row.before, row.after)
		}))
	});
};
