import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
	const tasks = await db.query.tasks.findMany({
		where: (tasks, { eq }) => eq(tasks.email, locals.user?.email)
	});
	return { user: locals.user, tasks };
};
