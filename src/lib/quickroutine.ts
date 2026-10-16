import type { NewRoutine, TaskKind } from '#lib/core/repo.js';
import { formatClock, formatDuration } from '#lib/format.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { QUICK_DURATION, parseQuickTask, quickTaskKind } from '#lib/quickadd.js';
import { takeRepeat } from '#lib/quickalarm.js';
import { repeatText } from '#lib/schedule.js';
import { formatDay, type DateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

/**
 * The routine a quick add line makes: "Lunch 12:00 45m daily", "Meds 8:00 weekdays", "Gym 18:00 every tue and thu".
 * It needs a clock time, a title and a repeat word, otherwise the line is an ordinary task or to-do (`null`). A day in
 * the line ("starting friday") is the first day, else today. A bare weekday is a day, not a repeat: only "every
 * friday" repeats. Never crosses midnight.
 */
export function quickRoutine(
	text: string,
	today: DateKey,
	chosen: TaskKind | null = null
): NewRoutine | null {
	const { repeat, rest } = takeRepeat(text, false);
	if (repeat === 'none') return null;
	const parsed = parseQuickTask(rest, today);
	// "from tomorrow" names the first day, the word before the day is not part of the title
	const title =
		parsed.date === undefined ? parsed.title : parsed.title.replace(/\s*\b(?:starting|from)$/i, '');
	if (parsed.startTime === null || !title) return null;
	const duration = Math.min(parsed.duration ?? QUICK_DURATION, DAY_MINUTES);
	// A travel task is made by the prep sheet, a routine is a task or an appointment
	const kind = quickTaskKind(rest, chosen === 'travel' ? null : chosen);
	return {
		title,
		priority: Priority.Medium,
		startTime: Math.min(parsed.startTime, DAY_MINUTES - duration),
		duration,
		repeat,
		firstDay: parsed.date ?? today,
		kind: kind === 'appointment' ? 'appointment' : 'block'
	};
}

/** What the line will do: "Routine: Every day, 12:00 to 12:45, 45m". Null when the line is no routine. */
export function quickRoutinePreview(
	text: string,
	today: DateKey,
	chosen: TaskKind | null = null
): string | null {
	const routine = quickRoutine(text, today, chosen);
	if (!routine) return null;
	const from = routine.firstDay === today ? '' : `, from ${formatDay(routine.firstDay, today)}`;
	const what = routine.kind === 'appointment' ? 'Repeating appointment' : 'Routine';
	return `${what}: ${repeatText(routine.repeat)}${from}, ${formatClock(routine.startTime)} to ${formatClock(routine.startTime + routine.duration)}, ${formatDuration(routine.duration)}`;
}
