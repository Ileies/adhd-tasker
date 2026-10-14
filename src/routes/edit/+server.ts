import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { AssistantError } from '#lib/core/context.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { isDateKey } from '#lib/time.js';
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

/** All tasks of one day, for days the layout did not preload. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Login required');
	const date = url.searchParams.get('date');
	if (!isDateKey(date)) error(400, 'date must be YYYY-MM-DD');
	return Response.json(await serverCtx(locals.user.email).repo.tasks.between(date, date));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const created = await answering(
		createPlanTask(serverCtx(locals.user.email), await readBody(request))
	);
	return Response.json(created);
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	await answering(updatePlanTask(serverCtx(locals.user.email), await readBody(request)));
	return Response.json(true);
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	await answering(deletePlanTask(serverCtx(locals.user.email), await readBody(request)));
	return Response.json(true);
};
