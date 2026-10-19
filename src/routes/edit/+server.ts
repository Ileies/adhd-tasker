import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { changesTime, describeWrite, READ_ONLY_REASON } from '#lib/core/calendar.js';
import type { Ctx } from '#lib/core/context.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { isDateKey } from '#lib/time.js';
import { isReadOnly, writeTaskChange, type Written } from '#lib/server/calendar-write.js';
import { handler } from '#lib/server/route.js';

/** The task as stored, `null` when the body names none. */
async function stored(ctx: Ctx, body: unknown): Promise<Written | null> {
	const id = (body as { id?: unknown } | null)?.id;
	return typeof id === 'number' ? ((await ctx.repo.tasks.get(id)) ?? null) : null;
}

/**
 * Tells Google about a change to the plan when Calendar is followed (6.3). Never fails the edit: what could not be
 * written is told to the open screens, the plan has the change either way.
 */
async function mirror(ctx: Ctx, email: string, before: Written | null, after: Written | null) {
	const outcome = await writeTaskChange(email, before, after, ctx.now());
	const message = describeWrite(outcome, (after ?? before)?.title ?? '');
	if (message) ctx.hint({ type: 'calendar', message });
}

/** All tasks of one day (`?date=`), or of every day from one on (`?from=`) for the first look after a load. */
export const GET: RequestHandler = handler(async ({ ctx, url }) => {
	const from = url.searchParams.get('from');
	if (from !== null) {
		if (!isDateKey(from)) error(400, 'from must be YYYY-MM-DD');
		return Response.json(await ctx.repo.tasks.between(from));
	}
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await ctx.repo.tasks.between(date, date));
});

export const POST: RequestHandler = handler(async ({ ctx, user, json }) => {
	const created = await createPlanTask(ctx, await json({}));
	await mirror(ctx, user.email, null, created);
	return Response.json(created);
});

export const PUT: RequestHandler = handler(async ({ ctx, user, json }) => {
	const body = await json({});
	const before = await stored(ctx, body);
	if (before && changesTime(before, body) && isReadOnly(user.email, before.id))
		error(409, READ_ONLY_REASON);
	await updatePlanTask(ctx, body);
	if (before) await mirror(ctx, user.email, before, await stored(ctx, body));
	return Response.json(true);
});

export const DELETE: RequestHandler = handler(async ({ ctx, user, json }) => {
	const body = await json({});
	const before = await stored(ctx, body);
	await deletePlanTask(ctx, body);
	if (before) await mirror(ctx, user.email, before, null);
	return Response.json(true);
});
