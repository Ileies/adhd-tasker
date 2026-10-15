import type { NewTask } from '#lib/core/repo.js';
import { formatClock, formatDuration } from '#lib/format.js';
import { DAY_MINUTES, SNAP } from '#lib/plan.js';
import { Priority } from '#lib/types.js';

export interface QuickTask {
	title: string;
	/** Minutes since midnight, null when the text names no time. */
	startTime: number | null;
	/** Minutes, null when the text names no duration. */
	duration: number | null;
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

/**
 * Reads "Call dentist 14:30 for 45m" style text: a title plus an optional time and duration.
 * Recognised times: `14:30`, `2pm`, `2:30pm`, `at 14`. Durations: `45m`, `2h`, `1h30m`, `1.5h`.
 * Whatever is left after removing those is the title.
 */
export function parseQuickTask(text: string): QuickTask {
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

	const title = rest
		.replace(/\b(for|at)\s*$/i, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return { title, startTime, duration: duration !== null && duration > 0 ? duration : null };
}

/** A task from the quick add line starts in the morning on another day, and without a duration it lasts this long. */
export const QUICK_START = 9 * 60;
export const QUICK_DURATION = 30;

/**
 * The task a quick add line makes for `date`, `null` when the text has no title. A task without a time
 * starts at the next free quarter hour when `now` is given (planning today), in the morning otherwise.
 * It never crosses midnight.
 */
export function quickTask(text: string, date: string, now: number | null): NewTask | null {
	const parsed = parseQuickTask(text);
	if (!parsed.title) return null;
	const duration = Math.min(parsed.duration ?? QUICK_DURATION, DAY_MINUTES);
	const fallback =
		now === null
			? QUICK_START
			: Math.min(DAY_MINUTES - QUICK_DURATION, Math.ceil(now / SNAP) * SNAP);
	return {
		title: parsed.title,
		description: '',
		date,
		startTime: Math.min(parsed.startTime ?? fallback, DAY_MINUTES - duration),
		duration,
		priority: Priority.Medium
	};
}

/** What a quick add line will create, as a sentence: "Call dentist, 14:30 to 15:15, 45 min". Null without a title. */
export function quickPreview(text: string, date: string, now: number | null): string | null {
	const task = quickTask(text, date, now);
	if (!task) return null;
	return `${task.title}, ${formatClock(task.startTime)} to ${formatClock(task.startTime + task.duration)}, ${formatDuration(task.duration)}`;
}
