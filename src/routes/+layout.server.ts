import type { LayoutServerLoad } from './$types';
import { db } from '#lib/server/db/index.js';
import { addDays, todayIn } from '#lib/time.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	// From yesterday on, so the client can pick its own "today" whatever the timezone. The Plan screen fetches older days itself.
	const since = addDays(todayIn('UTC'), -1);
	const tasks = await db.query.tasks.findMany({
		where: (tasks, { and, eq, gte }) => and(eq(tasks.email, locals.user?.email), gte(tasks.date, since))
	});
	// The OpenAI key stays on the server, the client only learns whether one is saved
	const { openaiKey, ...user } = locals.user ?? {};
	return { user: locals.user ? { ...user, hasOpenaiKey: !!openaiKey } : undefined, tasks };
};
