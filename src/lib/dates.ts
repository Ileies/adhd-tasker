/**
 * Dates in the quick add line ("Study Math by Nov 5", "Call mum friday", "Report in 20 days") and the words that
 * say how far a due date is. Pure, calendar arithmetic only so timezones and daylight saving do not matter.
 */
import { daysBetween } from '#lib/pick.js';
import { addDays, type DateKey } from '#lib/time.js';

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A lead word that says the date is a deadline or a day. It goes with the date, not into the title. */
const LEAD = '(?:(?:due|by|on|until|before)\\s+)?';
const MONTH_NAMES = `(${MONTHS.map((month) => `${month}|${month.slice(0, 3)}`).join('|')})`;
const WEEKDAY_NAMES = `(${WEEKDAYS.map((day) => `${day}|${day.slice(0, 3)}`).join('|')})`;
const ORDINAL = '(?:st|nd|rd|th)?';

const ISO = new RegExp(`\\b${LEAD}(\\d{4})-(\\d{2})-(\\d{2})\\b`, 'i');
const IN_DAYS = new RegExp(`\\b${LEAD}in\\s+(\\d{1,3})\\s*(days?|d|weeks?|w)\\b`, 'i');
const WORD = new RegExp(`\\b${LEAD}(today|tomorrow)\\b`, 'i');
// A short weekday (fri) needs a lead word, it is too often just a word. The full name alone is enough
const WEEKDAY_LEAD = new RegExp(
	`\\b(?:(?:due|by|on|until|before|next)\\s+)${WEEKDAY_NAMES}\\b`,
	'i'
);
const WEEKDAY_FULL = new RegExp(`\\b(?:next\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i');
const MONTH_DAY = new RegExp(`\\b${LEAD}${MONTH_NAMES}\\.?\\s+(\\d{1,2})${ORDINAL}\\b`, 'i');
const DAY_MONTH = new RegExp(`\\b${LEAD}(\\d{1,2})${ORDINAL}\\s+${MONTH_NAMES}\\b`, 'i');
// 5.11. needs the closing dot, 1.5h is a length
const DOTTED = new RegExp(`\\b${LEAD}(\\d{1,2})\\.(\\d{1,2})\\.(?!\\d)`, 'i');

/** The date `month`/`day` has next, this year or the next when it is past. `null` for a day that does not exist (Feb 30). */
function upcoming(month: number, day: number, today: DateKey): DateKey | null {
	const year = Number(today.slice(0, 4));
	// Up to eight years ahead, so Feb 29 finds the next leap year
	for (let candidate = year; candidate <= year + 8; candidate++) {
		const date = new Date(Date.UTC(candidate, month - 1, day));
		if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
		const key = date.toISOString().slice(0, 10);
		if (key >= today) return key;
	}
	return null;
}

/** The next time the weekday comes, never today: "friday" on a Friday means in a week. */
function nextWeekday(index: number, today: DateKey): DateKey {
	const current = new Date(`${today}T00:00:00Z`).getUTCDay();
	const ahead = ((index - current + 6) % 7) + 1;
	return addDays(today, ahead);
}

const monthIndex = (name: string) =>
	MONTHS.findIndex((month) => month.startsWith(name.slice(0, 3).toLowerCase())) + 1;
const weekdayIndex = (name: string) =>
	WEEKDAYS.findIndex((day) => day.startsWith(name.slice(0, 3).toLowerCase()));

/**
 * The first date `text` names, and the text without it. Understood: `today`, `tomorrow`, a weekday (`friday`,
 * `by fri`, `next monday`), `Nov 5`, `5 November`, `5.11.`, `2026-11-05` and `in 20 days` or `in 3 weeks`, each with
 * an optional `due`, `by`, `on`, `until` or `before` in front. A month and day that are past mean next year.
 */
export function takeDate(text: string, today: DateKey): { date: DateKey | null; rest: string } {
	const take = (pattern: RegExp, read: (match: RegExpMatchArray) => DateKey | null) => {
		const match = text.match(pattern);
		const date = match ? read(match) : null;
		return match && date ? { date, rest: text.replace(match[0], ' ') } : null;
	};

	return (
		take(ISO, ([, year, month, day]) => {
			const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
			return date.getUTCDate() === Number(day) && date.getUTCMonth() === Number(month) - 1
				? `${year}-${month}-${day}`
				: null;
		}) ??
		take(IN_DAYS, ([, count, unit]) =>
			addDays(today, Number(count) * (unit.toLowerCase().startsWith('w') ? 7 : 1))
		) ??
		take(WORD, ([, word]) => addDays(today, word.toLowerCase() === 'today' ? 0 : 1)) ??
		take(WEEKDAY_LEAD, ([, name]) => nextWeekday(weekdayIndex(name), today)) ??
		take(WEEKDAY_FULL, ([, name]) => nextWeekday(weekdayIndex(name), today)) ??
		take(MONTH_DAY, ([, month, day]) => upcoming(monthIndex(month), Number(day), today)) ??
		take(DAY_MONTH, ([, day, month]) => upcoming(monthIndex(month), Number(day), today)) ??
		take(DOTTED, ([, day, month]) => upcoming(Number(month), Number(day), today)) ?? {
			date: null,
			rest: text
		}
	);
}

/** How far a due date is, in words after "due": `today`, `tomorrow`, `in 12 days`, `overdue`. */
export function dueWords(dueDate: DateKey, today: DateKey): string {
	const days = daysBetween(today, dueDate);
	if (days < 0) return 'overdue';
	if (days === 0) return 'today';
	return days === 1 ? 'tomorrow' : `in ${days} days`;
}
