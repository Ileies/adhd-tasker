import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { AssistantError } from '#lib/core/context.js';
import { createTodo, deleteTodo, loadTodos, updateTodo } from '#lib/core/todos.js';
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

/** Every open to-do and the ones finished in the last day and a half. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	return Response.json(await loadTodos(serverCtx(locals.user.email)));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	return Response.json(await answering(createTodo(ctx, await readBody(request))));
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	return Response.json(await answering(updateTodo(ctx, await readBody(request))));
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const ctx = serverCtx(locals.user.email);
	await answering(deleteTodo(ctx, await readBody(request)));
	return Response.json(true);
};
