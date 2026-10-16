import type { NewTask, TaskKind, TodoPatch } from '#lib/core/repo.js';
import { dueWords, takeDate } from '#lib/dates.js';
import { formatClock, formatDuration } from '#lib/format.js';
import { DAY_MINUTES, SNAP } from '#lib/plan.js';
import { formatDay, type DateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

export interface QuickTask {
	title: string;
	/** Minutes since midnight, null when the text names no time. */
	startTime: number | null;
	/** Minutes, null when the text names no duration. */
	duration: number | null;
	/** The day the text names, only read when `parseQuickTask` was given today's date. */
	date?: DateKey;
}

const TIME_COLON = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/i;
const TIME_MERIDIEM = /\b(?:at\s+)?(1[0-2]|0?[1-9])\s*(am|pm)\b/i;
const TIME_AT = /\bat\s+([01]?\d|2[0-3])\b/i;
const DURATION_COMBINED = /\b(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m(?:in(?:ute)?s?)?\b/i;
const DURATION_HOURS = /\b(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?\b/i;
const DURATION_MINUTES = /\b(\d+)\s*m(?:in(?:ute)?s?)?\b/i;

function to24h(hour: number, meridiem?: string): number {
	if (!meridiem) return hour;
	const pm = meridiem.toLowerCase() === 'pm';
	return (hour % 12) + (pm ? 12 : 0);
}

/** The first clock time in `text` (`14:30`, `2pm`, `at 14`) in minutes since midnight, and the text without it. */
export function takeClock(text: string): { minutes: number | null; rest: string } {
	const colon = text.match(TIME_COLON);
	if (colon)
		return {
			minutes: to24h(Number(colon[1]), colon[3]) * 60 + Number(colon[2]),
			rest: text.replace(colon[0], ' ')
		};
	const meridiem = text.match(TIME_MERIDIEM);
	if (meridiem)
		return {
			minutes: to24h(Number(meridiem[1]), meridiem[2]) * 60,
			rest: text.replace(meridiem[0], ' ')
		};
	const at = text.match(TIME_AT);
	if (at) return { minutes: Number(at[1]) * 60, rest: text.replace(at[0], ' ') };
	return { minutes: null, rest: text };
}

/**
 * Reads "Call dentist 14:30 for 45m" style text: a title plus an optional time and duration.
 * Recognised times: `14:30`, `2pm`, `2:30pm`, `at 14`. Durations: `45m`, `2h`, `1h30m`, `1.5h`.
 * With `today` it also reads a day (`tomorrow`, `friday`, `Nov 5`, `in 3 days`, see `dates.ts`).
 * Whatever is left after removing those is the title.
 */
export function parseQuickTask(text: string, today?: DateKey): QuickTask {
	let rest = text;
	let startTime: number | null = null;
	let duration: number | null = null;

	const take = (pattern: RegExp, read: (match: RegExpMatchArray) => void) => {
		const match = rest.match(pattern);
		if (!match) return false;
		read(match);
		rest = rest.replace(match[0], ' ');
		return true;
	};
	// Only the first pattern that matches is taken
	const takeFirst = (...options: Parameters<typeof take>[]) =>
		options.some(([pattern, read]) => take(pattern, read));

	// Duration first so "1h30m" is not read as a time
	takeFirst(
		[DURATION_COMBINED, (m) => (duration = Number(m[1]) * 60 + Number(m[2]))],
		[DURATION_HOURS, (m) => (duration = Math.round(Number(m[1].replace(',', '.')) * 60))],
		[DURATION_MINUTES, (m) => (duration = Number(m[1]))]
	);

	takeFirst(
		[TIME_COLON, (m) => (startTime = to24h(Number(m[1]), m[3]) * 60 + Number(m[2]))],
		[TIME_MERIDIEM, (m) => (startTime = to24h(Number(m[1]), m[2]) * 60)],
		[TIME_AT, (m) => (startTime = Number(m[1]) * 60)]
	);

	const named = today === undefined ? { date: null, rest } : takeDate(rest, today);
	rest = named.rest;

	const title = rest
		.replace(/\b(for|at)\s*$/i, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return {
		title,
		startTime,
		duration: duration !== null && duration > 0 ? duration : null,
		...(named.date !== null && { date: named.date })
	};
}

/** Words that mark a line as an appointment: somebody else's time, it ends on its own (`docs/flow-plan.md` 5.10). */
export const APPOINTMENT_WORDS = [
	'exam',
	'test',
	'meeting',
	'appointment',
	'doctor',
	'dentist',
	'interview',
	'lecture',
	'class',
	'flight',
	'train'
];
/** "Call dentist" is an errand of the user's own, "Dentist 14:30" is a visit: these first words keep it a task. */
const ERRAND_WORDS = [
	'call',
	'email',
	'text',
	'book',
	'cancel',
	'reschedule',
	'prepare',
	'study',
	'write',
	'read',
	'buy',
	'pay',
	'order',
	'ask',
	'remind'
];

/**
 * Whether the words of a title say it is an appointment. A wrong task at a time costs one "Did you do it?", a wrong
 * appointment would silently skip it, so the list is short and an errand ("Call dentist") stays a task.
 */
export function looksLikeAppointment(title: string): boolean {
	const words = title.toLowerCase().match(/[a-z]+/g) ?? [];
	const [first] = words;
	if (first === undefined || ERRAND_WORDS.includes(first)) return false;
	return words.some((word) => APPOINTMENT_WORDS.includes(word));
}

/**
 * What a line with a time makes: a task of the user's own or an appointment, chosen by the words unless the user
 * tapped the chip. `null` for a line without a time or a title, that one is a to-do.
 */
export function quickTaskKind(text: string, chosen: TaskKind | null = null): TaskKind | null {
	const parsed = parseQuickTask(text);
	if (parsed.startTime === null || !parsed.title) return null;
	return chosen ?? (looksLikeAppointment(parsed.title) ? 'appointment' : 'block');
}

/**
 * What a quick add line makes: a time means a task at a time, everything else is a to-do (it has no time, the
 * app finds the time for it). A line names a time only with a clock time.
 */
export function quickKind(text: string): 'task' | 'todo' {
	return parseQuickTask(text).startTime === null ? 'todo' : 'task';
}

/** The to-do a quick add line makes: a length is its size, a day is its due date. `null` without a title. */
export function quickTodo(text: string, today: DateKey): (TodoPatch & { title: string }) | null {
	const parsed = parseQuickTask(text, today);
	if (!parsed.title) return null;
	return {
		title: parsed.title,
		priority: Priority.Medium,
		...(parsed.duration !== null && { estimate: parsed.duration }),
		...(parsed.date !== undefined && { dueDate: parsed.date })
	};
}

/** A task from the quick add line starts in the morning on another day, and without a duration it lasts this long. */
export const QUICK_START = 9 * 60;
export const QUICK_DURATION = 30;

/**
 * The task a quick add line makes for `date`, `null` when the text has no title. A task without a time
 * starts at the next free quarter hour when `now` is given (planning today), in the morning otherwise.
 * It never crosses midnight.
 */
export function quickTask(
	text: string,
	date: string,
	now: number | null,
	today: DateKey = date,
	chosen: TaskKind | null = null
): NewTask | null {
	const parsed = parseQuickTask(text, today);
	if (!parsed.title) return null;
	const duration = Math.min(parsed.duration ?? QUICK_DURATION, DAY_MINUTES);
	// A day named in the line is not the day being planned: the morning, not "the next quarter hour"
	const taskDate = parsed.date ?? date;
	const fallback =
		now === null || taskDate !== date
			? QUICK_START
			: Math.min(DAY_MINUTES - QUICK_DURATION, Math.ceil(now / SNAP) * SNAP);
	return {
		title: parsed.title,
		description: '',
		date: taskDate,
		startTime: Math.min(parsed.startTime ?? fallback, DAY_MINUTES - duration),
		duration,
		priority: Priority.Medium,
		// A line without a time is no appointment, whatever its words say
		kind: parsed.startTime === null ? 'block' : (quickTaskKind(text, chosen) ?? 'block')
	};
}

/**
 * What a quick add line will do, named by kind: "Task, 14:30 to 15:15, 45 min" or "To-do, about 10 h, due Thu, Nov 5".
 * Null without a title and when there is nothing to say beyond a plain to-do (the preview would only repeat the line).
 */
export function quickPreview(
	text: string,
	date: string,
	now: number | null,
	today: DateKey = date,
	chosen: TaskKind | null = null
): string | null {
	const parsed = parseQuickTask(text, today);
	if (!parsed.title) return null;
	if (parsed.startTime === null) {
		// "Tomorrow" says it all, a date that is further away also says how far
		const far = parsed.date !== undefined ? dueWords(parsed.date, today) : '';
		const parts = [
			parsed.duration !== null && `about ${formatDuration(parsed.duration)}`,
			parsed.date !== undefined &&
				`due ${formatDay(parsed.date, today)}${far.startsWith('in ') ? ` (${far})` : ''}`
		].filter(Boolean);
		return `To-do${parts.length > 0 ? `, ${parts.join(', ')}` : ''}`;
	}
	const task = quickTask(text, date, now, today, chosen);
	if (!task) return null;
	const day = task.date === date ? '' : `${formatDay(task.date, today)}, `;
	const what = task.kind === 'appointment' ? 'Appointment' : 'Task';
	return `${what}, ${day}${formatClock(task.startTime)} to ${formatClock(task.startTime + task.duration)}, ${formatDuration(task.duration)}`;
}
