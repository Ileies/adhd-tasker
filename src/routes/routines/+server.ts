import type { RequestHandler } from './$types';
import { createRoutine, deleteRoutine, loadRoutines, updateRoutine } from '#lib/core/routines.js';
import { handler } from '#lib/server/route.js';

/** Every routine of the user, oldest first. */
export const GET: RequestHandler = handler(async ({ ctx }) =>
	Response.json(await loadRoutines(ctx))
);

export const POST: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await createRoutine(ctx, await json({})))
);

export const PUT: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await updateRoutine(ctx, await json({})))
);

/** Answers the routine as it was, so the client can make it again for an Undo. */
export const DELETE: RequestHandler = handler(async ({ ctx, json }) =>
	Response.json(await deleteRoutine(ctx, await json({})))
);
