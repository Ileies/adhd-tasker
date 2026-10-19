import { formatClock } from '#lib/format.js';
import { addDays, isDateKey, todayIn, weekdayOf, zonedToEpoch } from '#lib/time.js';
import { parseTone, type Tone } from '#lib/tones.js';

/** Alarms ring on the client, wakeups wake the agent. Both are rows of the `schedule` table. */
export type ScheduleKind = 'wakeup' | 'alarm';

/**
 * How an alarm repeats: `none`, `daily`, `weekdays` (Monday to Friday) or `days:1,3,6`, a list of weekday numbers
 * (0 Sunday to 6 Saturday, ascending). A stored list is always normalized, so every day is `daily`, Monday to Friday
 * is `weekdays` and no day is `none`. `parseRepeat` is the one way in.
 */
export type Repeat = 'none' | 'daily' | 'weekdays' | `days:${string}`;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, the order the day chips are shown in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const dayName = (day: number, short = false) =>
	short ? DAY_NAMES[day].slice(0, 3) : DAY_NAMES[day];

/** The repeat for a set of weekdays (0 Sunday to 6 Saturday), normalized. */
export function repeatFromDays(days: Iterable<number>): Repeat {
	const set = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
	if (set.length === 0) return 'none';
	if (set.length === 7) return 'daily';
	if (set.join() === '1,2,3,4,5') return 'weekdays';
	return `days:${set.join(',')}`;
}

/** The weekdays an alarm rings on, `null` for a one-off. */
export function repeatDays(repeat: Repeat): number[] | null {
	if (repeat === 'none') return null;
	if (repeat === 'daily') return [0, 1, 2, 3, 4, 5, 6];
	if (repeat === 'weekdays') return [1, 2, 3, 4, 5];
	return repeat.slice(5).split(',').map(Number);
}

/** A stored or given value as a normalized repeat, `null` when it is none of the forms. */
export function parseRepeat(value: unknown): Repeat | null {
	if (value === 'none' || value === 'daily' || value === 'weekdays') return value;
	if (typeof value !== 'string' || !/^days:[0-6](,[0-6])*$/.test(value)) return null;
	const repeat = repeatFromDays(repeatDays(value as Repeat)!);
	return repeat === value ? repeat : null;
}

/** Whether a repeat rings on a weekday number (0 Sunday to 6 Saturday). */
export const repeatsOn = (repeat: Repeat, day: number) =>
	repeat !== 'none' && repeatDays(repeat)!.includes(day);

/** "Once", "Every day", "Monday to Friday", "Saturday", "Wed to Fri", "Tue, Thu, Sun". */
export function repeatText(repeat: Repeat): string {
	if (repeat === 'none') return 'Once';
	if (repeat === 'daily') return 'Every day';
	if (repeat === 'weekdays') return 'Monday to Friday';
	const days = repeatDays(repeat)!;
	if (days.length === 1) return dayName(days[0]);
	// A run of consecutive days (Monday first, Sunday last) reads as "Wed to Fri"
	const order = days.map((d) => WEEK_ORDER.indexOf(d as (typeof WEEK_ORDER)[number])).sort();
	const run = order.length >= 3 && order.at(-1)! - order[0] === order.length - 1;
	const names = order.map((i) => dayName(WEEK_ORDER[i], true));
	return run ? `${names[0]} to ${names.at(-1)}` : names.join(', ');
}

export const SCHEDULE_LIMITS = {
	maxWakeups: 10,
	maxAlarms: 30,
	/** A wakeup sooner than this would turn the agent into a loop. */
	minWakeupMinutes: 5,
	maxAheadDays: 14,
	maxNote: 300,
	maxLabel: 60,
	/** How long an alarm keeps ringing when nobody dismisses it. */
	defaultAlarmMinutes: 5,
	maxAlarmMinutes: 30,
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

/**
 * Why a new alarm cannot be set: another alarm (on or off) already rings in the same minute. `ignoreId` is the
 * alarm being edited. `null` when the time is free.
 */
export function alarmClash(
	alarms: { id: number; fireAt: number }[],
	fireAt: number,
	timezone: string,
	ignoreId?: number
): string | null {
	const minute = Math.floor(fireAt / 60_000);
	const clash = alarms.some(
		(alarm) => alarm.id !== ignoreId && Math.floor(alarm.fireAt / 60_000) === minute
	);
	return clash ? `There is already an alarm at ${formatClock(minutesOf(fireAt, timezone))}` : null;
}

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
		if (!repeatsOn(repeat, weekdayOf(date))) continue;
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
	/** Minutes it rings before it stops by itself. */
	durationMin: number;
}

export function parseAlarm(args: Args, nowMs: number, timezone: string): Parsed<AlarmFields> {
	const when = resolveWhen(args, nowMs, timezone);
	if (!when.ok) return when;
	const tone = parseTone(args.tone);
	if (!tone.ok) return tone;
	const repeat = args.repeat === undefined ? 'none' : parseRepeat(args.repeat);
	if (repeat === null)
		return fail(
			'repeat must be none, daily, weekdays or days:1,3,6 (0 Sunday to 6 Saturday, ascending)'
		);
	if (repeat !== 'none' && when.value.minutes === null)
		return fail('a repeating alarm needs a clock time (at), not in_minutes');
	// The first ring is the first matching day from the asked time on, "Sat only" made on a Monday waits for Saturday
	const first =
		repeat !== 'none' && when.value.minutes !== null
			? nextRepeat(repeat, when.value.minutes, when.value.fireAt - 1, timezone)
			: null;
	if (first !== null) {
		if (first > nowMs + SCHEDULE_LIMITS.maxAheadDays * 86_400_000)
			return fail(`at most ${SCHEDULE_LIMITS.maxAheadDays} days ahead`);
		when.value.fireAt = first;
	}
	const label = parseText(args.label, SCHEDULE_LIMITS.maxLabel);
	if (!label) return fail(`label is required (max ${SCHEDULE_LIMITS.maxLabel} characters)`);
	const durationMin = args.duration_minutes ?? SCHEDULE_LIMITS.defaultAlarmMinutes;
	if (
		typeof durationMin !== 'number' ||
		!Number.isInteger(durationMin) ||
		durationMin < 1 ||
		durationMin > SCHEDULE_LIMITS.maxAlarmMinutes
	)
		return fail(
			`duration_minutes must be a whole number from 1 to ${SCHEDULE_LIMITS.maxAlarmMinutes}`
		);
	return {
		ok: true,
		value: {
			...when.value,
			label,
			tone: tone.value,
			custom: tone.custom,
			repeat,
			durationMin
		}
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
	const repeat = entry.repeat === 'none' ? '' : `, ${repeatText(entry.repeat)}`;
	const text = entry.kind === 'alarm' ? `alarm "${entry.label}"` : `wakeup note "${entry.note}"`;
	return `#${entry.id} ${when} ${text}${repeat} (by ${entry.createdBy})`;
}
