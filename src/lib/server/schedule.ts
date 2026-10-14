import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { schedule, users } from '#lib/server/db/schema.js';
import { countUses, emit, recordUsage, startOfDayMs } from '#lib/server/events.js';
import { effectiveDisplay, publish } from '#lib/server/stream.js';
import { inQuietHours } from '#lib/guardrails.js';
import { parseToolArguments } from '#lib/assistant-tools.js';
import { SCHEDULE_LIMITS, describeEntry, minutesOf, nextRepeat, parseAlarm, parseId, parseWakeup, type AlarmFields } from '#lib/schedule.js';
import { TONE_LIMITS, parseTone, readTone } from '#lib/tones.js';
import { minutesNow } from '#lib/time.js';

type UserRow = typeof users.$inferSelect;
export type ScheduleRow = typeof schedule.$inferSelect;

export const pendingFor = (email: string) =>
	db
		.select()
		.from(schedule)
		.where(and(eq(schedule.email, email), eq(schedule.status, 'pending')))
		.orderBy(asc(schedule.fireAt));

/** What the client needs to ring an alarm on its own, even when the stream is down for a moment. */
export const alarmsOf = (rows: ScheduleRow[]) =>
	rows
		.filter((row) => row.kind === 'alarm')
		.map((row) => ({ id: row.id, fireAt: row.fireAt, label: row.label ?? '', tone: readTone(row.tone), repeat: row.repeat, createdBy: row.createdBy }));

/** One line per pending entry for the model, so it remembers what it already scheduled. */
export const describePending = (rows: ScheduleRow[], timezone: string) => rows.map((row) => describeEntry(row, timezone));

/** Tells every tab which device plays sound right now. Call after a connection or the setting changed. */
export async function announceDisplay(email: string) {
	const user = await db.query.users.findFirst({ where: eq(users.email, email), columns: { displayDevice: true } });
	publish(email, { type: 'display', device: effectiveDisplay(email, user?.displayDevice ?? null) });
}

export async function createAlarm(email: string, fields: AlarmFields, createdBy: 'user' | 'agent') {
	const [row] = await db
		.insert(schedule)
		.values({
			email,
			kind: 'alarm',
			fireAt: fields.fireAt,
			minutes: fields.minutes,
			repeat: fields.repeat,
			label: fields.label,
			tone: fields.tone,
			createdBy,
			createdAt: Date.now()
		})
		.returning();
	publish(email, { type: 'schedule' });
	return row;
}

/** `null` when the id is not a pending entry of this user. */
export async function cancelEntry(email: string, id: number): Promise<ScheduleRow | null> {
	const [row] = await db
		.update(schedule)
		.set({ status: 'cancelled' })
		.where(and(eq(schedule.id, id), eq(schedule.email, email), eq(schedule.status, 'pending')))
		.returning();
	if (row) publish(email, { type: 'schedule' });
	return row ?? null;
}

async function customTonesLeft(email: string, user: UserRow) {
	const used = await countUses(email, 'tone', startOfDayMs(minutesNow(user.timezone ?? 'UTC'), Date.now()));
	return TONE_LIMITS.customPerDay - used;
}

/**
 * Runs one schedule tool for the model. `fromChat` means the user asked for it, so a wakeup may fall in quiet hours.
 * Everything is validated by the pure parsers, the caps are enforced here and not left to the prompt.
 */
export async function runScheduleTool(email: string, user: UserRow, name: string, rawArguments: string, fromChat: boolean): Promise<unknown> {
	const args = parseToolArguments(rawArguments);
	if (!args) return { error: 'arguments were not valid JSON' };
	const timezone = user.timezone ?? 'UTC';
	const now = Date.now();

	switch (name) {
		case 'schedule_wakeup': {
			const parsed = parseWakeup(args, now, timezone);
			if (!parsed.ok) return { error: parsed.error };
			if (!fromChat && inQuietHours(minutesOf(parsed.value.fireAt, timezone), user.quietStart, user.quietEnd)) return { error: 'that time falls in the quiet hours, pick another or ask the user' };
			const pending = (await pendingFor(email)).filter((row) => row.kind === 'wakeup');
			if (pending.length >= SCHEDULE_LIMITS.maxWakeups) return { error: `at most ${SCHEDULE_LIMITS.maxWakeups} pending wakeups, cancel one first`, pending: describePending(pending, timezone) };
			const [row] = await db
				.insert(schedule)
				.values({ email, kind: 'wakeup', fireAt: parsed.value.fireAt, note: parsed.value.note, createdBy: 'agent', createdAt: now })
				.returning();
			publish(email, { type: 'schedule' });
			return { scheduled: describeEntry(row, timezone) };
		}
		case 'set_alarm': {
			const parsed = parseAlarm(args, now, timezone);
			if (!parsed.ok) return { error: parsed.error };
			const pending = (await pendingFor(email)).filter((row) => row.kind === 'alarm');
			if (pending.length >= SCHEDULE_LIMITS.maxAlarms) return { error: `at most ${SCHEDULE_LIMITS.maxAlarms} alarms, cancel one first` };
			if (parsed.value.custom) {
				if ((await customTonesLeft(email, user)) <= 0) return { error: `at most ${TONE_LIMITS.customPerDay} custom tones per day, use a named tone` };
				await recordUsage(email, 'tone', 0);
			}
			const row = await createAlarm(email, parsed.value, 'agent');
			return { set: describeEntry(row, timezone) };
		}
		case 'play_tone': {
			const tone = parseTone(args.tone);
			if (!tone.ok) return { error: tone.error };
			if (tone.custom) {
				if ((await customTonesLeft(email, user)) <= 0) return { error: `at most ${TONE_LIMITS.customPerDay} custom tones per day, use a named tone` };
				await recordUsage(email, 'tone', 0);
			}
			const devices = publish(email, { type: 'tone', tone: tone.value });
			return devices ? { played: true } : { played: false, reason: 'no screen is open' };
		}
		case 'cancel_schedule': {
			const id = parseId(args);
			if (!id.ok) return { error: id.error };
			const row = await cancelEntry(email, id.value);
			return row ? { cancelled: describeEntry(row, timezone) } : { error: 'no such pending entry' };
		}
		default:
			return { error: 'unknown tool' };
	}
}

/**
 * Fires what is due. Repeating alarms move on before anything else so a crash can never ring twice, an entry that is
 * long overdue (the server was down) is retired without ringing, a late alarm is worse than none.
 */
export async function fireDue(nowMs = Date.now()) {
	const due = await db
		.select()
		.from(schedule)
		.where(and(eq(schedule.status, 'pending'), lte(schedule.fireAt, nowMs)))
		.orderBy(asc(schedule.fireAt));
	if (due.length === 0) return;

	const zones = new Map<string, string>();
	for (const row of due) {
		if (!zones.has(row.email)) {
			const user = await db.query.users.findFirst({ where: eq(users.email, row.email), columns: { timezone: true } });
			zones.set(row.email, user?.timezone ?? 'UTC');
		}
		const next = row.kind === 'alarm' && row.minutes !== null ? nextRepeat(row.repeat, row.minutes, nowMs, zones.get(row.email)!) : null;
		await db.update(schedule).set(next ? { fireAt: next } : { status: 'done' }).where(eq(schedule.id, row.id));

		if (nowMs - row.fireAt > SCHEDULE_LIMITS.lateMs) continue;
		if (row.kind === 'alarm') {
			await emit(row.email, 'alarm.fired', { id: row.id, label: row.label, createdBy: row.createdBy }, 'system', `alarm:${row.id}:${row.fireAt}`);
			publish(row.email, { type: 'alarm', id: row.id, fireAt: row.fireAt, label: row.label ?? '', tone: readTone(row.tone) });
		} else {
			await emit(row.email, 'wakeup.fired', { id: row.id, note: row.note }, 'system', `wakeup:${row.id}`);
		}
	}
	for (const email of new Set(due.map((row) => row.email))) publish(email, { type: 'schedule' });
}

/** Housekeeping: finished and cancelled entries only clutter the table. */
export async function pruneSchedule(before: number) {
	await db.delete(schedule).where(and(inArray(schedule.status, ['done', 'cancelled']), lt(schedule.fireAt, before)));
}
