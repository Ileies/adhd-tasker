import type { AlarmFields } from '#lib/backend.js';
import { formatClock, formatClock24, formatMinutes } from '#lib/format.js';
import { takeClock } from '#lib/quickadd.js';
import { SCHEDULE_LIMITS, repeatFromDays, repeatText, type Repeat } from '#lib/schedule.js';

/** What an alarm gets when the line does not name a label. */
const QUICK_ALARM_LABEL = 'Alarm';

const REPEAT_WEEKDAYS = /\b(?:every\s+weekday|weekdays?|mon(?:day)?\s*(?:to|-)\s*fri(?:day)?)\b/i;
const REPEAT_DAILY = /\b(?:every\s*day|daily)\b/i;
const DAY = '(?:mon|tue(?:s)?|wed(?:nes)?|thu(?:r(?:s)?)?|fri|sat(?:ur)?|sun)(?:day)?';
const DAY_SEPARATOR = '\\s*(?:-|to|through|until|,|/|and|&)\\s*';
/** "Sat", "Wed-Fri", "Tue/Thu/Sun", "every monday and friday". */
const REPEAT_DAYS = new RegExp(`\\b(?:every\\s+|on\\s+)?${DAY}(?:${DAY_SEPARATOR}${DAY})*\\b`, 'i');
const DAY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const RANGE_WORD = /^(?:-|to|through|until)$/i;

/** The weekday numbers (0 Sunday to 6 Saturday) a day phrase names, a range runs on through the week's end. */
function readDays(phrase: string): number[] {
	const days: number[] = [];
	let range = false;
	for (const token of phrase.match(new RegExp(`${DAY}|-|to|through|until`, 'gi')) ?? []) {
		if (RANGE_WORD.test(token)) {
			range = true;
			continue;
		}
		const day = DAY_INDEX.indexOf(token.slice(0, 3).toLowerCase());
		const last = days.at(-1);
		if (range && last !== undefined) {
			for (let d = (last + 1) % 7; d !== day; d = (d + 1) % 7) days.push(d);
		}
		days.push(day);
		range = false;
	}
	return days;
}
const IN_COMBINED = /\bin\s+(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m(?:in(?:ute)?s?)?\b/i;
const IN_HOURS = /\bin\s+(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?\b/i;
const IN_MINUTES = /\bin\s+(\d+)\s*m(?:in(?:ute)?s?)?\b/i;

/**
 * The repeat a line names and the line without it: `daily`, `weekdays`, `every weekday`, `Mon-Fri`, `every friday`,
 * `Tue/Thu`. A bare day ("Sat") is only a repeat with `bareDays`, an alarm line has no other use for it while a task
 * line reads it as the day it happens on.
 */
export function takeRepeat(text: string, bareDays: boolean): { repeat: Repeat; rest: string } {
	if (REPEAT_WEEKDAYS.test(text))
		return { repeat: 'weekdays', rest: text.replace(REPEAT_WEEKDAYS, ' ') };
	if (REPEAT_DAILY.test(text)) return { repeat: 'daily', rest: text.replace(REPEAT_DAILY, ' ') };
	const match = text.match(REPEAT_DAYS);
	if (match && (bareDays || /^every\s/i.test(match[0])))
		return { repeat: repeatFromDays(readDays(match[0])), rest: text.replace(match[0], ' ') };
	return { repeat: 'none', rest: text };
}

export interface QuickAlarm {
	label: string;
	/** Clock time as minutes since midnight, null for a timer or when the text names none. */
	time: number | null;
	/** Minutes from now ("in 20 min"), null for a clock alarm. */
	inMinutes: number | null;
	repeat: Repeat;
}

/**
 * Reads "Wake up 7:00 weekdays" or "Tea in 5 min": a label, then either a clock time (with an optional
 * `daily` or `weekdays`) or a wait from now. Unlike a task there is no duration, "45m" alone is not read.
 */
export function parseQuickAlarm(text: string): QuickAlarm {
	let inMinutes: number | null = null;
	let { repeat, rest } = takeRepeat(text, true);

	const waits: [RegExp, (m: RegExpMatchArray) => number][] = [
		[IN_COMBINED, (m) => Number(m[1]) * 60 + Number(m[2])],
		[IN_HOURS, (m) => Math.round(Number(m[1].replace(',', '.')) * 60)],
		[IN_MINUTES, (m) => Number(m[1])]
	];
	for (const [pattern, read] of waits) {
		const match = rest.match(pattern);
		if (!match) continue;
		inMinutes = read(match);
		rest = rest.replace(match[0], ' ');
		break;
	}

	let time: number | null = null;
	if (inMinutes === null) {
		const clock = takeClock(rest);
		time = clock.minutes;
		rest = clock.rest;
	} else {
		// A timer cannot repeat
		repeat = 'none';
	}

	const label = rest
		.replace(/\b(for|at)\s*$/i, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return {
		label: label.slice(0, SCHEDULE_LIMITS.maxLabel) || QUICK_ALARM_LABEL,
		time,
		inMinutes: inMinutes !== null && inMinutes > 0 ? inMinutes : null,
		repeat
	};
}

/** The alarm a line makes, `null` when it names no time and no wait. */
export function quickAlarmFields(text: string): AlarmFields | null {
	const parsed = parseQuickAlarm(text);
	if (parsed.inMinutes !== null)
		return { in_minutes: parsed.inMinutes, label: parsed.label, tone: 'chime', repeat: 'none' };
	if (parsed.time === null) return null;
	return {
		at: formatClock24(parsed.time),
		label: parsed.label,
		tone: 'wake',
		repeat: parsed.repeat
	};
}

/** What the line will do: "Rings at 07:00, every day" or "Rings in 5 min". Null while it names no time. */
export function quickAlarmPreview(text: string): string | null {
	const parsed = parseQuickAlarm(text);
	if (parsed.inMinutes !== null) return `Rings in ${formatMinutes(parsed.inMinutes)}`;
	if (parsed.time === null) return null;
	const repeat = parsed.repeat === 'none' ? '' : ` (${repeatText(parsed.repeat)})`;
	return `Rings at ${formatClock(parsed.time)}${repeat}`;
}
