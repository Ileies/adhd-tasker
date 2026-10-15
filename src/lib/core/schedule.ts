import { AssistantError, type Ctx } from '#lib/core/context.js';
import { countUsesToday, recordUsage } from '#lib/core/usage.js';
import { emit } from '#lib/core/events.js';
import type { ScheduleEntry, Settings } from '#lib/core/repo.js';
import { inQuietHours } from '#lib/guardrails.js';
import { parseToolArguments } from '#lib/assistant-tools.js';
import {
	SCHEDULE_LIMITS,
	alarmClash,
	describeEntry,
	minutesOf,
	nextRepeat,
	parseAlarm,
	parseId,
	parseWakeup,
	type AlarmFields
} from '#lib/schedule.js';
import { TONE_LIMITS, parseTone, readTone } from '#lib/tones.js';

/** What the client needs to ring an alarm on its own, even when the stream is down for a moment. */
export const alarmsOf = (rows: ScheduleEntry[]) =>
	rows
		.filter((row) => row.kind === 'alarm')
		.map((row) => ({
			id: row.id,
			fireAt: row.fireAt,
			label: row.label ?? '',
			tone: readTone(row.tone),
			repeat: row.repeat,
			durationMin: row.durationMin,
			enabled: row.enabled,
			createdBy: row.createdBy
		}));

/** One line per pending entry for the model, so it remembers what it already scheduled. */
export const describePending = (rows: ScheduleEntry[], timezone: string) =>
	rows.map((row) => describeEntry(row, timezone));

export async function createAlarm(ctx: Ctx, fields: AlarmFields, createdBy: 'user' | 'agent') {
	const row = await ctx.repo.schedule.insert({
		kind: 'alarm',
		fireAt: fields.fireAt,
		minutes: fields.minutes,
		repeat: fields.repeat,
		label: fields.label,
		tone: fields.tone,
		durationMin: fields.durationMin,
		createdBy,
		createdAt: ctx.now()
	});
	ctx.hint({ type: 'schedule' });
	return row;
}

/** The pending alarms (the client rings them itself) and the agent's wakeups (shown, never played). */
export async function scheduleOverview(ctx: Ctx) {
	const rows = await ctx.repo.schedule.pending();
	return {
		alarms: alarmsOf(rows),
		wakeups: rows
			.filter((row) => row.kind === 'wakeup')
			.map((row) => ({ id: row.id, fireAt: row.fireAt, note: row.note ?? '' }))
	};
}

/** A user-made alarm: `{ at: 'HH:MM', label, tone?: name, repeat? }`. Custom tones are for the agent only. */
export async function addUserAlarm(ctx: Ctx, body: unknown, timezone: string) {
	if (typeof body !== 'object' || body === null) throw new AssistantError('Invalid request', 400);
	if ('tone' in body && body.tone !== undefined && typeof body.tone !== 'string')
		throw new AssistantError('Pick a tone from the list', 400);

	const parsed = parseAlarm(body as Record<string, unknown>, ctx.now(), timezone);
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	const alarms = (await ctx.repo.schedule.pending()).filter((row) => row.kind === 'alarm');
	if (alarms.length >= SCHEDULE_LIMITS.maxAlarms)
		throw new AssistantError(`At most ${SCHEDULE_LIMITS.maxAlarms} alarms`, 400);
	const clash = alarmClash(alarms, parsed.value.fireAt, timezone);
	if (clash) throw new AssistantError(clash, 400);
	return createAlarm(ctx, parsed.value, 'user');
}

/**
 * Changes a pending alarm: same fields as a new one, it keeps its on/off state and its maker. A body without
 * `tone` keeps the tone it has (an agent's custom tone survives a rename). `null` when it is not a pending alarm.
 */
export async function updateUserAlarm(
	ctx: Ctx,
	id: number,
	body: unknown,
	timezone: string
): Promise<ScheduleEntry | null> {
	if (typeof body !== 'object' || body === null) throw new AssistantError('Invalid request', 400);
	if ('tone' in body && body.tone !== undefined && typeof body.tone !== 'string')
		throw new AssistantError('Pick a tone from the list', 400);
	const row = (await ctx.repo.schedule.pending()).find(
		(entry) => entry.id === id && entry.kind === 'alarm'
	);
	if (!row) return null;

	const args = { ...(body as Record<string, unknown>) };
	if (args.tone === undefined && row.tone) args.tone = row.tone;
	if (args.duration_minutes === undefined) args.duration_minutes = row.durationMin;
	const parsed = parseAlarm(args, ctx.now(), timezone);
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	const others = (await ctx.repo.schedule.pending()).filter((entry) => entry.kind === 'alarm');
	const clash = alarmClash(others, parsed.value.fireAt, timezone, id);
	if (clash) throw new AssistantError(clash, 400);
	const patch = {
		fireAt: parsed.value.fireAt,
		minutes: parsed.value.minutes,
		repeat: parsed.value.repeat,
		label: parsed.value.label,
		tone: parsed.value.tone,
		durationMin: parsed.value.durationMin
	};
	await ctx.repo.schedule.update(id, patch);
	ctx.hint({ type: 'schedule' });
	return { ...row, ...patch };
}

/** `null` when the id is not a pending entry of this user. */
export async function cancelEntry(ctx: Ctx, id: number): Promise<ScheduleEntry | null> {
	const row = await ctx.repo.schedule.cancel(id);
	if (row) ctx.hint({ type: 'schedule' });
	return row;
}

/**
 * Turns an alarm on or off, it stays in the list either way. While it was off its time may have passed: a clock
 * alarm then waits for its next time, a timer has run out and cannot come back. `null` when it is not a pending alarm.
 */
export async function setAlarmEnabled(
	ctx: Ctx,
	id: number,
	enabled: boolean,
	timezone: string
): Promise<ScheduleEntry | null> {
	const row = (await ctx.repo.schedule.pending()).find(
		(entry) => entry.id === id && entry.kind === 'alarm'
	);
	if (!row) return null;
	const patch: { enabled: boolean; fireAt?: number } = { enabled };
	const now = ctx.now();
	if (enabled && row.fireAt <= now) {
		const next =
			row.minutes === null
				? null
				: nextRepeat(row.repeat === 'none' ? 'daily' : row.repeat, row.minutes, now, timezone);
		if (next === null) throw new AssistantError('That timer has run out, set a new one', 400);
		patch.fireAt = next;
	}
	await ctx.repo.schedule.update(id, patch);
	ctx.hint({ type: 'schedule' });
	return { ...row, ...patch };
}

async function customTonesLeft(ctx: Ctx, settings: Settings) {
	const used = await countUsesToday(ctx, settings.timezone ?? 'UTC', 'tone');
	return TONE_LIMITS.customPerDay - used;
}

/**
 * Runs one schedule tool for the model. `fromChat` means the user asked for it, so a wakeup may fall in quiet hours.
 * Everything is validated by the pure parsers, the caps are enforced here and not left to the prompt.
 */
export async function runScheduleTool(
	ctx: Ctx,
	settings: Settings,
	name: string,
	rawArguments: string,
	fromChat: boolean
): Promise<unknown> {
	const args = parseToolArguments(rawArguments);
	if (!args) return { error: 'arguments were not valid JSON' };
	const timezone = settings.timezone ?? 'UTC';
	const now = ctx.now();

	switch (name) {
		case 'schedule_wakeup': {
			const parsed = parseWakeup(args, now, timezone);
			if (!parsed.ok) return { error: parsed.error };
			if (
				!fromChat &&
				inQuietHours(
					minutesOf(parsed.value.fireAt, timezone),
					settings.quietStart,
					settings.quietEnd
				)
			)
				return { error: 'that time falls in the quiet hours, pick another or ask the user' };
			const pending = (await ctx.repo.schedule.pending()).filter((row) => row.kind === 'wakeup');
			if (pending.length >= SCHEDULE_LIMITS.maxWakeups)
				return {
					error: `at most ${SCHEDULE_LIMITS.maxWakeups} pending wakeups, cancel one first`,
					pending: describePending(pending, timezone)
				};
			const row = await ctx.repo.schedule.insert({
				kind: 'wakeup',
				fireAt: parsed.value.fireAt,
				note: parsed.value.note,
				createdBy: 'agent',
				createdAt: now
			});
			ctx.hint({ type: 'schedule' });
			return { scheduled: describeEntry(row, timezone) };
		}
		case 'set_alarm': {
			const parsed = parseAlarm(args, now, timezone);
			if (!parsed.ok) return { error: parsed.error };
			const pending = (await ctx.repo.schedule.pending()).filter((row) => row.kind === 'alarm');
			if (pending.length >= SCHEDULE_LIMITS.maxAlarms)
				return { error: `at most ${SCHEDULE_LIMITS.maxAlarms} alarms, cancel one first` };
			const clash = alarmClash(pending, parsed.value.fireAt, timezone);
			if (clash) return { error: clash };
			if (parsed.value.custom) {
				if ((await customTonesLeft(ctx, settings)) <= 0)
					return {
						error: `at most ${TONE_LIMITS.customPerDay} custom tones per day, use a named tone`
					};
				await recordUsage(ctx, 'tone', 0);
			}
			const row = await createAlarm(ctx, parsed.value, 'agent');
			return { set: describeEntry(row, timezone) };
		}
		case 'play_tone': {
			const tone = parseTone(args.tone);
			if (!tone.ok) return { error: tone.error };
			if (tone.custom) {
				if ((await customTonesLeft(ctx, settings)) <= 0)
					return {
						error: `at most ${TONE_LIMITS.customPerDay} custom tones per day, use a named tone`
					};
				await recordUsage(ctx, 'tone', 0);
			}
			const devices = ctx.hint({ type: 'tone', tone: tone.value });
			return devices ? { played: true } : { played: false, reason: 'no screen is open' };
		}
		case 'cancel_schedule': {
			const id = parseId(args);
			if (!id.ok) return { error: id.error };
			const row = await cancelEntry(ctx, id.value);
			return row ? { cancelled: describeEntry(row, timezone) } : { error: 'no such pending entry' };
		}
		default:
			return { error: 'unknown tool' };
	}
}

/**
 * Fires what is due. Repeating alarms move on before anything else so a crash can never ring twice, an entry that is
 * long overdue (the app was closed) is retired without ringing, a late alarm is worse than none.
 */
export async function fireDue(ctx: Ctx, timezone: string) {
	const nowMs = ctx.now();
	const due = await ctx.repo.schedule.due(nowMs);
	if (due.length === 0) return;

	for (const row of due) {
		const next =
			row.kind === 'alarm' && row.minutes !== null
				? nextRepeat(row.repeat, row.minutes, nowMs, timezone)
				: null;
		await ctx.repo.schedule.update(row.id, next ? { fireAt: next } : { status: 'done' });

		if (nowMs - row.fireAt > SCHEDULE_LIMITS.lateMs) continue;
		if (row.kind === 'alarm') {
			await emit(
				ctx,
				'alarm.fired',
				{ id: row.id, label: row.label, createdBy: row.createdBy },
				'system',
				`alarm:${row.id}:${row.fireAt}`
			);
			ctx.hint({
				type: 'alarm',
				id: row.id,
				fireAt: row.fireAt,
				label: row.label ?? '',
				tone: readTone(row.tone),
				durationMin: row.durationMin
			});
		} else {
			await emit(ctx, 'wakeup.fired', { id: row.id, note: row.note }, 'system', `wakeup:${row.id}`);
		}
	}
	ctx.hint({ type: 'schedule' });
}
