import { and, eq, lte } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { schedule } from '#lib/server/db/schema.js';
import { fireDue } from '#lib/core/schedule.js';
import { serverCtx } from '#lib/server/ctx.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { effectiveDisplay, publish } from '#lib/server/stream.js';

/** Tells every tab which device plays sound right now. Call after a connection or the setting changed. */
export async function announceDisplay(email: string) {
	const { displayDevice } = await dbRepo(email).settings.get();
	publish(email, { type: 'display', device: effectiveDisplay(email, displayDevice) });
}

/** The 15 s tick: fires what is due for every account that has something due. */
export async function fireAllDue() {
	const owners = await db
		.selectDistinct({ email: schedule.email })
		.from(schedule)
		.where(and(eq(schedule.status, 'pending'), lte(schedule.fireAt, Date.now())));
	for (const { email } of owners) {
		const { timezone } = await dbRepo(email).settings.get();
		await fireDue(serverCtx(email), timezone ?? 'UTC');
	}
}
