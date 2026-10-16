import { Priority, TaskStatus, type Task } from '#lib/types.js';
import { priorityStyle } from '#lib/urgency.js';

export type RankTask = Pick<
	Task,
	'id' | 'title' | 'startTime' | 'duration' | 'priority' | 'status'
> &
	/** Absent in a test that is not about it, and for tasks saved before appointments: a block. */
	Partial<Pick<Task, 'kind'>>;

/** Appointments and travel end on their own, they are never missed and never run out unanswered. */
export const endsOnItsOwn = (task: Pick<RankTask, 'kind'>) =>
	task.kind === 'appointment' || task.kind === 'travel';

export interface Ranking<T extends RankTask = Task> {
	/** The task at a time that is on right now, null when none is. */
	current: T | null;
	/** Tasks that have not started yet, by start time. */
	upcoming: T[];
	/** Tasks of the user's own whose window ended without being completed, most recent first. Appointments just end. */
	missed: T[];
	/** How many tasks are running right now, the current one included. */
	concurrent: number;
}

const endOf = (task: RankTask) => task.startTime + task.duration;
const priorityOf = (task: RankTask) => task.priority || Priority.Medium;

/** Highest priority first, then earlier start, then shorter, then lower id so the order never flickers. */
function compareCurrent(a: RankTask, b: RankTask): number {
	return (
		priorityOf(b) - priorityOf(a) ||
		a.startTime - b.startTime ||
		a.duration - b.duration ||
		a.id - b.id
	);
}

/**
 * Decides what the user should be doing at `now` (minutes since midnight).
 * Pure and shared: the screen renders it, and the server will run the same function to detect switches.
 * Only completion matters for ranking, the stored active and overdue statuses are ignored.
 */
export function rank<T extends RankTask>(tasks: T[], now: number): Ranking<T> {
	const open = tasks.filter((task) => task.status !== TaskStatus.Completed);

	const running = open
		.filter((task) => task.startTime <= now && now < endOf(task))
		.sort(compareCurrent);
	const upcoming = open
		.filter((task) => task.startTime > now)
		.sort((a, b) => a.startTime - b.startTime || compareCurrent(a, b));
	const missed = open
		.filter((task) => endOf(task) <= now && !endsOnItsOwn(task))
		.sort((a, b) => endOf(b) - endOf(a) || a.id - b.id);

	return { current: running[0] ?? null, upcoming, missed, concurrent: running.length };
}

/** Minutes left until the task's window ends, negative when over. */
export function minutesLeft(task: RankTask, now: number): number {
	return endOf(task) - now;
}

/**
 * One line explaining why the screen changed, so the user keeps trusting it.
 * `prev` is the task that was current before, null when the page just loaded.
 * Returns null when the current task did not change.
 */
export function switchReason<T extends RankTask>(
	prev: T | null,
	ranking: Ranking<T>,
	tasks: T[],
	now: number
): string | null {
	const next = ranking.current;
	if (next?.id === prev?.id) return null;

	if (!prev) {
		return ranking.concurrent > 1
			? `Highest priority of ${ranking.concurrent} tasks right now`
			: 'Scheduled for now';
	}

	const latest = tasks.find((task) => task.id === prev.id);
	let why: string;
	if (!latest) why = 'Previous task removed';
	else if (latest.status === TaskStatus.Completed) why = 'Previous task done';
	else if (now >= endOf(latest)) why = 'Time for the previous task ended';
	else if (next && priorityOf(next) > priorityOf(latest))
		why = `${priorityStyle[priorityOf(next)].label} priority task started`;
	else why = 'Next task started';

	return next ? why : `${why}. Nothing else is due right now`;
}
