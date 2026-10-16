/**
 * The routine sheet's form: what the fields hold, what is wrong with them, and which fields an edit changed (an edit
 * sends only those, so the backend knows what the days that follow the routine have to follow).
 */
import type { Routine, RoutinePatch } from '#lib/core/repo.js';
import { formatClock } from '#lib/format.js';
import { QUICK_DURATION, QUICK_START } from '#lib/quickadd.js';
import { repeatDays, repeatFromDays, repeatText } from '#lib/schedule.js';
import { endLine } from '#lib/taskform.js';
import { Priority } from '#lib/types.js';

export interface RoutineForm {
	title: string;
	description: string;
	startTime: number;
	duration: number;
	priority: Priority;
	kind: 'block' | 'appointment';
	shift: number;
	/** The weekdays it repeats on (0 Sunday to 6 Saturday). */
	days: number[];
	firstDay: string;
	lastDay: string | null;
}

/** The shortcuts above the day chips. */
export const REPEAT_PRESETS: { text: string; days: number[] }[] = [
	{ text: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
	{ text: 'Mon to Fri', days: [1, 2, 3, 4, 5] }
];

/** A new routine starts today, every day, in the morning. */
export function newRoutineForm(today: string): RoutineForm {
	return {
		title: '',
		description: '',
		startTime: QUICK_START,
		duration: QUICK_DURATION,
		priority: Priority.Medium,
		kind: 'block',
		shift: 0,
		days: REPEAT_PRESETS[0].days,
		firstDay: today,
		lastDay: null
	};
}

export function routineForm(routine: Routine): RoutineForm {
	return {
		title: routine.title,
		description: routine.description,
		startTime: routine.startTime,
		duration: routine.duration,
		priority: routine.priority,
		kind: routine.kind,
		shift: routine.shift,
		days: repeatDays(routine.repeat) ?? [],
		firstDay: routine.firstDay,
		lastDay: routine.lastDay
	};
}

/** What is wrong with the form, said as the user would read it. `null` when it can be saved. */
export function checkRoutineForm(form: RoutineForm): string | null {
	if (!form.title.trim()) return 'Give the routine a title';
	if (form.days.length === 0) return 'Pick at least one day';
	const end = endLine(form.startTime, form.duration);
	if (end.over) return end.text;
	if (form.lastDay !== null && form.lastDay < form.firstDay)
		return 'The last day is before the first day';
	return null;
}

/** Every field the form holds, as the backend takes them. */
export function routineFields(form: RoutineForm): Omit<Routine, 'id' | 'through'> {
	return {
		title: form.title.trim(),
		description: form.description,
		startTime: form.startTime,
		duration: form.duration,
		priority: form.priority,
		kind: form.kind,
		// Only a task of the user's own moves, an appointment keeps its time
		shift: form.kind === 'block' ? form.shift : 0,
		repeat: repeatFromDays(form.days) as Routine['repeat'],
		firstDay: form.firstDay,
		lastDay: form.lastDay
	};
}

/** The fields of the form that differ from the routine, empty when nothing changed. */
export function routineChanges(routine: Routine, form: RoutineForm): RoutinePatch {
	const changes: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(routineFields(form)))
		if (routine[key as keyof Routine] !== value) changes[key] = value;
	return changes as RoutinePatch;
}

/** One line for the list: "Every day, 12:00 to 12:45". */
export function routineLine(routine: Routine): string {
	return `${repeatText(routine.repeat)}, ${formatClock(routine.startTime)} to ${formatClock(routine.startTime + routine.duration)}`;
}

/** The routine a task was made from, `null` for a task of the user's own or when the routine is gone. */
export function routineOf(task: { routineId: number | null }, routines: Routine[]): Routine | null {
	return task.routineId === null
		? null
		: (routines.find((routine) => routine.id === task.routineId) ?? null);
}
