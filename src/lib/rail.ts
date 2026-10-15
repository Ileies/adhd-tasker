import { TaskStatus } from '#lib/types.js';
import { formatClock } from '#lib/format.js';
import { localMoment, type DateKey } from '#lib/time.js';

/** How many finished tasks today has. Only ever grows, so it cannot turn into a guilt meter. */
export function doneToday(tasks: { date: string; status: TaskStatus }[], today: DateKey): number {
	return tasks.filter((task) => task.date === today && task.status === TaskStatus.Completed).length;
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
