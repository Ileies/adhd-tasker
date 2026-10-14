import { addDays, isDateKey, todayIn, zonedToEpoch } from '#lib/time.js';
import { parseTone, type Tone } from '#lib/tones.js';

/** Alarms ring on the client, wakeups wake the agent. Both are rows of the `schedule` table. */
export const SCHEDULE_KINDS = ['wakeup', 'alarm'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const REPEATS = ['none', 'daily', 'weekdays'] as const;
export type Repeat = (typeof REPEATS)[number];

export const REPEAT_TEXT: Record<Repeat, string> = {
	none: 'Once',
	daily: 'Every day',
	weekdays: 'Monday to Friday'
};

export const SCHEDULE_LIMITS = {
	maxWakeups: 10,
	maxAlarms: 30,
	/** A wakeup sooner than this would turn the agent into a loop. */
	minWakeupMinutes: 5,
	maxAheadDays: 14,
	maxNote: 300,
	maxLabel: 60,
	/** A fired entry that is older than this was missed (server down), it is retired instead of ringing late. */
	lateMs: 10 * 60_000
} as const;

type Args = Record<string, unknown>;
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

const parseClock = (value: unknown): number | undefined => {
	const match =
		typeof value === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
	return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

/** Minutes since midnight of an instant in a timezone. */
export function minutesOf(ms: number, timezone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(new Date(ms));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return get('hour') * 60 + get('minute');
}

const isWeekday = (date: string) => {
	const day = new Date(date + 'T00:00:00Z').getUTCDay();
	return day !== 0 && day !== 6;
};

/**
 * When something fires: `in_minutes` from now, or the clock time `at` on `date`. Without a date it is the next
 * time that clock reads `at`, today if that is still ahead, else tomorrow.
 */
export function resolveWhen(
	args: Args,
	nowMs: number,
	timezone: string
): Parsed<{ fireAt: number; minutes: number | null }> {
	const horizon = nowMs + SCHEDULE_LIMITS.maxAheadDays * 86_400_000;
	let fireAt: number;
	let minutes: number | null = null;

	if (args.in_minutes !== undefined) {
		if (
			typeof args.in_minutes !== 'number' ||
			!Number.isInteger(args.in_minutes) ||
			args.in_minutes < 1
		)
			return fail('in_minutes must be a whole number of minutes, at least 1');
		fireAt = nowMs + args.in_minutes * 60_000;
	} else {
		const at = parseClock(args.at);
		if (at === undefined)
			return fail('give in_minutes, or at as HH:MM (optionally with date as YYYY-MM-DD)');
		minutes = at;
		if (args.date !== undefined) {
			if (!isDateKey(args.date)) return fail('date must be YYYY-MM-DD');
			fireAt = zonedToEpoch(args.date, at, timezone);
		} else {
			const today = todayIn(timezone, new Date(nowMs));
			fireAt = zonedToEpoch(today, at, timezone);
			if (fireAt <= nowMs) fireAt = zonedToEpoch(addDays(today, 1), at, timezone);
		}
	}
	if (fireAt <= nowMs) return fail('that time is already past');
	if (fireAt > horizon) return fail(`at most ${SCHEDULE_LIMITS.maxAheadDays} days ahead`);
	return { ok: true, value: { fireAt, minutes } };
}

/** The next time a repeating alarm rings after `afterMs`, at the same local clock time. Null for a one-off. */
export function nextRepeat(
	repeat: Repeat,
	minutes: number,
	afterMs: number,
	timezone: string
): number | null {
	if (repeat === 'none') return null;
	const start = todayIn(timezone, new Date(afterMs));
	for (let offset = 0; offset < 9; offset++) {
		const date = addDays(start, offset);
		if (repeat === 'weekdays' && !isWeekday(date)) continue;
		const at = zonedToEpoch(date, minutes, timezone);
		if (at > afterMs) return at;
	}
	return null;
}

const parseText = (value: unknown, max: number): string =>
	typeof value === 'string' ? value.trim().slice(0, max) : '';

export interface AlarmFields {
	fireAt: number;
	/** Local clock time, kept for repeating alarms. */
	minutes: number | null;
	label: string;
	tone: Tone;
	custom: boolean;
	repeat: Repeat;
}

export function parseAlarm(args: Args, nowMs: number, timezone: string): Parsed<AlarmFields> {
	const when = resolveWhen(args, nowMs, timezone);
	if (!when.ok) return when;
	const tone = parseTone(args.tone);
	if (!tone.ok) return tone;
	const repeat = args.repeat === undefined ? 'none' : args.repeat;
	if (!REPEATS.includes(repeat as Repeat))
		return fail(`repeat must be one of ${REPEATS.join(', ')}`);
	if (repeat !== 'none' && when.value.minutes === null)
		return fail('a repeating alarm needs a clock time (at), not in_minutes');
	const label = parseText(args.label, SCHEDULE_LIMITS.maxLabel);
	if (!label) return fail(`label is required (max ${SCHEDULE_LIMITS.maxLabel} characters)`);
	return {
		ok: true,
		value: { ...when.value, label, tone: tone.value, custom: tone.custom, repeat: repeat as Repeat }
	};
}

export function parseWakeup(
	args: Args,
	nowMs: number,
	timezone: string
): Parsed<{ fireAt: number; note: string }> {
	const when = resolveWhen(args, nowMs, timezone);
	if (!when.ok) return when;
	if (when.value.fireAt - nowMs < SCHEDULE_LIMITS.minWakeupMinutes * 60_000)
		return fail(`a wakeup must be at least ${SCHEDULE_LIMITS.minWakeupMinutes} minutes ahead`);
	const note = parseText(args.note, SCHEDULE_LIMITS.maxNote);
	if (!note) return fail('note is required: what you want to check or do when you wake up');
	return { ok: true, value: { fireAt: when.value.fireAt, note } };
}

export function parseId(args: Args): Parsed<number> {
	return typeof args.id === 'number' && Number.isInteger(args.id)
		? { ok: true, value: args.id }
		: fail('id must be a schedule id');
}

/** A one-line description for the model and the lists. */
export function describeEntry(
	entry: {
		id: number;
		kind: ScheduleKind;
		fireAt: number;
		label: string | null;
		note: string | null;
		repeat: Repeat;
		createdBy: string;
	},
	timezone: string
): string {
	const when = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	})
		.format(new Date(entry.fireAt))
		.replace(',', '');
	const repeat = entry.repeat === 'none' ? '' : `, ${REPEAT_TEXT[entry.repeat]}`;
	const text = entry.kind === 'alarm' ? `alarm "${entry.label}"` : `wakeup note "${entry.note}"`;
	return `#${entry.id} ${when} ${text}${repeat} (by ${entry.createdBy})`;
}
