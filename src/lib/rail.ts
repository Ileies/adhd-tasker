import { TaskStatus } from '#lib/types.js';
import { formatClock } from '#lib/format.js';
import { localMoment, type DateKey } from '#lib/time.js';

/** How many finished tasks today has. Only ever grows, so it cannot turn into a guilt meter. */
export function doneToday(tasks: { date: string; status: TaskStatus }[], today: DateKey): number {
	return tasks.filter((task) => task.date === today && task.status === TaskStatus.Completed).length;
}

/** How many to-dos were finished between two moments (epoch ms, `from` inclusive), the day of the count. */
export function todosDoneBetween(
	todos: { status: string; completedAt: number | null }[],
	from: number,
	to: number
): number {
	return todos.filter(
		(todo) =>
			todo.status === 'done' &&
			todo.completedAt !== null &&
			todo.completedAt >= from &&
			todo.completedAt < to
	).length;
}

/** The line under the clock, `null` at zero. */
export function doneLine(count: number): string | null {
	return count > 0 ? `${count} done today` : null;
}

/** `15:00 - 15:15`, the time a task takes in one glance. */
export function timeRange(task: { startTime: number; duration: number }): string {
	return `${formatClock(task.startTime)} - ${formatClock(task.startTime + task.duration)}`;
}

/** How many alarm lines the rail shows, so many timers cannot crowd the tasks. */
export const ALARM_LINES = 4;

/** The alarms still to ring today in time order, each as `Alarm 15:40 Leave` (at most `ALARM_LINES`). */
export function alarmLines(
	alarms: { fireAt: number; label: string; enabled?: boolean }[],
	now: number,
	today: DateKey,
	timezone: string
): string[] {
	return alarms
		.filter((alarm) => alarm.enabled !== false && alarm.fireAt > now)
		.sort((a, b) => a.fireAt - b.fireAt)
		.flatMap((alarm) => {
			const at = localMoment(alarm.fireAt, timezone);
			if (at.date !== today) return [];
			return [`Alarm ${formatClock(at.minutes)}${alarm.label ? ` ${alarm.label}` : ''}`];
		})
		.slice(0, ALARM_LINES);
}

/** One line of Next: a task at its start or a to-do at the time it is due. */
export type NextItem<T, D> =
	| { kind: 'task'; at: number; task: T }
	| { kind: 'todo'; at: number; todo: D };

/**
 * What comes next today in time order: the tasks that have not started and the open to-dos that are due today at a
 * time that is still ahead. A to-do without a time never queues here, it is picked by the flow engine, and one whose
 * time passed is overdue, not next. At the same minute the task comes first.
 */
export function nextItems<T extends { startTime: number }, D extends TodoDue>(
	upcoming: readonly T[],
	todos: readonly D[],
	today: DateKey,
	now: number
): NextItem<T, D>[] {
	const items: NextItem<T, D>[] = [
		...upcoming.map((task) => ({ kind: 'task' as const, at: task.startTime, task })),
		...todos
			.filter(
				(todo) =>
					todo.status === 'open' &&
					todo.dueDate === today &&
					todo.dueTime !== null &&
					todo.dueTime > now
			)
			.map((todo) => ({ kind: 'todo' as const, at: todo.dueTime!, todo }))
	];
	// The sort is stable, so the tasks stay in front of a to-do due at the same minute
	return items.sort((a, b) => a.at - b.at);
}

type TodoDue = { status: string; dueDate: string | null; dueTime: number | null };

/** The link under Next, `+3 later today`, or `null` when everything shows. */
export function laterLine(hidden: number): string | null {
	return hidden > 0 ? `+${hidden} later today` : null;
}

/** The quiet line that replaces the missed cards, `2 tasks need a decision`. */
export function missedLine(count: number): string | null {
	if (count <= 0) return null;
	return count === 1 ? '1 task needs a decision' : `${count} tasks need a decision`;
}

/** The note link on phones, where the rail is below the fold. */
export function noteLine(count: number): string | null {
	if (count <= 0) return null;
	return count === 1 ? '1 assistant note' : `${count} assistant notes`;
}
