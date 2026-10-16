/**
 * Routines: tasks at a time that repeat (`docs/flow-plan.md` 5.12). A routine is made into ordinary tasks 14 days
 * ahead, one per day it has. Only dates and local minutes are used, so a timezone or a daylight saving change
 * needs nothing: Lunch at 12:00 is 12:00 on every day it has, like a repeating alarm. Pure, the rules in
 * `#lib/core/routines.js` run it against a repo.
 */
import type { NewTask, Routine, Task } from '#lib/core/repo.js';
import { repeatsOn } from '#lib/schedule.js';
import { addDays, weekdayOf, type DateKey } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

/** How many days, today included, a routine is made ahead. */
export const ROUTINE_AHEAD_DAYS = 14;

/** The last day a routine is made for when today is `today`. */
export const horizon = (today: DateKey): DateKey => addDays(today, ROUTINE_AHEAD_DAYS - 1);

type Span = Pick<Routine, 'repeat' | 'firstDay' | 'lastDay'>;

/** The days a routine has from `from` to `to`, both inclusive, oldest first. */
export function routineDays(routine: Span, from: DateKey, to: DateKey): DateKey[] {
	const start = from < routine.firstDay ? routine.firstDay : from;
	const end = routine.lastDay !== null && routine.lastDay < to ? routine.lastDay : to;
	const days: DateKey[] = [];
	for (let date = start; date <= end; date = addDays(date, 1))
		if (repeatsOn(routine.repeat, weekdayOf(date))) days.push(date);
	return days;
}

/** Whether the tick has days to look at: nothing was made yet, or not as far ahead as it should be. */
export const needsMaking = (routine: Pick<Routine, 'through'>, today: DateKey) =>
	routine.through === null || routine.through < horizon(today);

/**
 * The days the tick makes tasks for: after the last day that was made, from today on, up to 14 days ahead. A day
 * before `through` that has no task was deleted on purpose and stays gone.
 */
export function daysToMake(routine: Routine, today: DateKey): DateKey[] {
	const from =
		routine.through !== null && routine.through >= today ? addDays(routine.through, 1) : today;
	return routineDays(routine, from, horizon(today));
}

/** The fields a routine gives each of its tasks. */
const fieldsOf = (routine: Routine) => ({
	title: routine.title,
	description: routine.description,
	startTime: routine.startTime,
	duration: routine.duration,
	priority: routine.priority,
	kind: routine.kind,
	shift: routine.shift
});

/** The task a routine makes for one day. */
export const routineTask = (routine: Routine, date: DateKey): NewTask => ({
	...fieldsOf(routine),
	date,
	status: TaskStatus.Pending,
	routineId: routine.id
});

/**
 * Whether an edit of the routine may change this task: it is still what the routine made of its day. A task the
 * user changed (moved, renamed, given more time) or finished is theirs, it stays as it is. Changing it back makes
 * it follow the routine again.
 */
export function followsRoutine(task: Task, routine: Routine): boolean {
	if (task.status === TaskStatus.Completed) return false;
	const fields = fieldsOf(routine);
	return (Object.keys(fields) as (keyof typeof fields)[]).every((key) => task[key] === fields[key]);
}

export interface RoutineEdit {
	/** Tasks that follow the routine and get its new fields. */
	change: { id: number; patch: Partial<NewTask> }[];
	/** Tasks that follow the routine on a day it no longer has. */
	remove: number[];
	/** Days it has now that have no task. */
	make: DateKey[];
}

/**
 * What an edit of a routine touches: its tasks from today on that are not detached, in the 14 days it is made for.
 * `tasks` are the routine's tasks from today on. Tasks of the user's own changes stay, and so does their day.
 */
export function planEdit(
	before: Routine,
	after: Routine,
	tasks: Task[],
	today: DateKey
): RoutineEdit {
	const wanted = routineDays(after, today, horizon(today));
	const taken = new Set<DateKey>();
	const edit: RoutineEdit = { change: [], remove: [], make: [] };
	const fresh = fieldsOf(after);
	for (const task of tasks) {
		if (!followsRoutine(task, before)) {
			taken.add(task.date);
			continue;
		}
		if (!wanted.includes(task.date)) {
			edit.remove.push(task.id);
			continue;
		}
		taken.add(task.date);
		const patch: Partial<NewTask> = {};
		for (const key of Object.keys(fresh) as (keyof typeof fresh)[])
			if (task[key] !== fresh[key]) Object.assign(patch, { [key]: fresh[key] });
		if (Object.keys(patch).length > 0) edit.change.push({ id: task.id, patch });
	}
	edit.make = wanted.filter((date) => !taken.has(date));
	return edit;
}

/** The tasks that go with a deleted routine: every one from today on that is not done. Past days are history. */
export const planDelete = (tasks: Task[], today: DateKey): number[] =>
	tasks
		.filter((task) => task.date >= today && task.status !== TaskStatus.Completed)
		.map((task) => task.id);
