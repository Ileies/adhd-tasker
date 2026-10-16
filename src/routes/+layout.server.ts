import type { LayoutServerLoad } from './$types';
import { loadFlow } from '#lib/core/flow.js';
import { loadRoutines } from '#lib/core/routines.js';
import { loadTodos } from '#lib/core/todos.js';
import { serverCtx } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { addDays, todayIn } from '#lib/time.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	// From yesterday on, so the client can pick its own "today" whatever the timezone. The Plan screen fetches older days itself.
	const since = addDays(todayIn('UTC'), -1);
	const tasks = locals.user ? await dbRepo(locals.user.email).tasks.between(since) : [];
	// To-dos have no day, and the flow log is read for the user's today (the client loads again when its own day differs)
	const ctx = locals.user ? serverCtx(locals.user.email) : null;
	const flowDate = todayIn(locals.user?.timezone);
	const [todos, flowRows, routines] = ctx
		? await Promise.all([loadTodos(ctx), loadFlow(ctx, flowDate), loadRoutines(ctx)])
		: [[], [], []];
	// The OpenAI key stays on the server, the client only learns whether one is saved
	const { openaiKey, ...user } = locals.user ?? {};
	return {
		user: locals.user ? { ...user, hasOpenaiKey: !!openaiKey } : undefined,
		tasks,
		todos,
		routines,
		flow: { date: flowDate, rows: flowRows }
	};
};
