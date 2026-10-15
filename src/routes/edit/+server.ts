import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { changesTime, describeWrite, READ_ONLY_REASON } from '#lib/core/calendar.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { isDateKey } from '#lib/time.js';
import { isReadOnly, writeTaskChange, type Written } from '#lib/server/calendar-write.js';
import { serverCtx } from '#lib/server/ctx.js';

/** The JSON body of a request, an empty object when it is missing or not JSON. */
const readBody = (request: Request) => request.json().catch(() => ({}));

/** Runs a core edit and turns its failure into the HTTP error a route answers with. */
async function answering<T>(work: Promise<T>) {
	try {
		return await work;
	} catch (thrown) {
		if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
		throw thrown;
	}
}

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
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const from = url.searchParams.get('from');
	if (from !== null) {
		if (!isDateKey(from)) error(400, 'from must be YYYY-MM-DD');
		return Response.json(await serverCtx(locals.user.email).repo.tasks.between(from));
	}
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await serverCtx(locals.user.email).repo.tasks.between(date, date));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	const created = await answering(createPlanTask(ctx, await readBody(request)));
	await mirror(ctx, locals.user.email, null, created);
	return Response.json(created);
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const { email } = locals.user;
	const ctx = serverCtx(email);
	const body = await readBody(request);
	const before = await stored(ctx, body);
	if (before && changesTime(before, body) && isReadOnly(email, before.id))
		error(409, READ_ONLY_REASON);
	await answering(updatePlanTask(ctx, body));
	if (before) await mirror(ctx, email, before, await stored(ctx, body));
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	const body = await readBody(request);
	const before = await stored(ctx, body);
	await answering(deletePlanTask(ctx, body));
	if (before) await mirror(ctx, locals.user.email, before, null);
	return Response.json(true);
};
