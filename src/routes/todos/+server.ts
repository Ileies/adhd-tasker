import type { RequestHandler } from './$types';
import { createTodo, deleteTodo, loadTodos, updateTodo } from '#lib/core/todos.js';
import { handler } from '#lib/server/route.js';

/** Every open to-do and the ones finished in the last day and a half. */
export const GET: RequestHandler = handler(async ({ ctx }) => Response.json(await loadTodos(ctx)));

export const POST: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await createTodo(ctx, await json({})))
);

export const PUT: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await updateTodo(ctx, await json({})))
);

export const DELETE: RequestHandler = handler(async ({ ctx, json }) => {
	await deleteTodo(ctx, await json({}));
	return Response.json(true);
});
