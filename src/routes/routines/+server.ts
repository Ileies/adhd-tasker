import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { AssistantError } from '#lib/core/context.js';
import { createRoutine, deleteRoutine, loadRoutines, updateRoutine } from '#lib/core/routines.js';
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

/** Every routine of the user, oldest first. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	return Response.json(await loadRoutines(serverCtx(locals.user.email)));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	return Response.json(await answering(createRoutine(ctx, await readBody(request))));
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	return Response.json(await answering(updateRoutine(ctx, await readBody(request))));
};

/** Answers the routine as it was, so the client can make it again for an Undo. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	return Response.json(await answering(deleteRoutine(ctx, await readBody(request))));
};
