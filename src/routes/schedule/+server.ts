import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SCHEDULE_LIMITS, parseAlarm } from '#lib/schedule.js';
import { alarmsOf, createAlarm } from '#lib/core/schedule.js';
import { serverCtx } from '#lib/server/ctx.js';

/** The pending alarms (the client rings them itself) and the agent's wakeups (shown, never played). */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Login required');
	const rows = await serverCtx(locals.user.email).repo.schedule.pending();
	return Response.json({
		alarms: alarmsOf(rows),
		wakeups: rows
			.filter((row) => row.kind === 'wakeup')
			.map((row) => ({ id: row.id, fireAt: row.fireAt, note: row.note ?? '' }))
	});
};

/** A user-made alarm: `{ at: 'HH:MM', label, tone?: name, repeat? }`. Custom tones are for the agent only. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');
	const body = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null) error(400, 'Invalid request');
	if (body.tone !== undefined && typeof body.tone !== 'string')
		error(400, 'Pick a tone from the list');

	const parsed = parseAlarm(body, Date.now(), locals.user.timezone ?? 'UTC');
	if (!parsed.ok) error(400, parsed.error);
	const ctx = serverCtx(locals.user.email);
	if (
		(await ctx.repo.schedule.pending()).filter((row) => row.kind === 'alarm').length >=
		SCHEDULE_LIMITS.maxAlarms
	)
		error(400, `At most ${SCHEDULE_LIMITS.maxAlarms} alarms`);

	const row = await createAlarm(ctx, parsed.value, 'user');
	return Response.json({ id: row.id }, { status: 201 });
};
