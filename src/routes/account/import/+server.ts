import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseExport } from '#lib/core/export.js';
import { MOVE_MODES } from '#lib/core/merge.js';
import { moveIntoAccount } from '#lib/server/account.js';
import { handler } from '#lib/server/route.js';
import { isDateKey } from '#lib/time.js';

/**
 * Moves a device's plan into the account: `{ file, mode, today }`, the file in the export format. Every
 * task and alarm is validated first and one invalid row refuses the whole file. The write is one transaction
 * after a snapshot of the account's plan, so nothing is half moved and the old plan can be restored.
 */
export const POST: RequestHandler = handler(async ({ ctx, user, json }) => {
	const { mode, today, file } = ((await json()) ?? {}) as Record<string, unknown>;
	const chosen = MOVE_MODES.find((known) => known === mode);
	if (!chosen) error(400, 'Choose how to move the plan: both or replace');
	if (!isDateKey(today)) error(400, 'Send today as a date, like 2026-10-14');
	const parsed = parseExport(file);
	if (!parsed.ok) error(400, parsed.error);

	let result;
	try {
		result = moveIntoAccount(user.email, parsed.value, chosen, today, ctx.now());
	} catch (failure) {
		console.error('[account] move failed', failure);
		error(500, 'Could not move the plan, nothing was changed');
	}
	// Open screens load the schedule again when alarms came in
	if (result.alarms > 0) ctx.hint({ type: 'schedule' });
	return Response.json(result);
});
