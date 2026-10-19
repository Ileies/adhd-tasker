import type { Task } from '#lib/core/repo.js';
import { Priority, TaskStatus } from '#lib/types.js';

/** The chips of "Can move by" in the task sheet, in minutes. 0 is "Stays". */
export const SHIFT_CHIPS = [0, 15, 30, 60, 120] as const;
/** How far a task may be allowed to move at most. */
export const MAX_SHIFT = 240;
/** Moved tasks start on this grid, like everything dragged on Plan. */
const PLACE_GRID = 15;

export type PlaceTask = Pick<
	Task,
	'id' | 'title' | 'startTime' | 'duration' | 'priority' | 'status'
> &
	/** Absent in a test that is not about it: a block that stays. */
	Partial<Pick<Task, 'kind' | 'shift'>>;

/** A task with the time it is placed at. `startTime` is the placed time, the stored one is `storedStart`. */
export type Placed<T extends PlaceTask> = T & {
	/** The time the user gave it, what the sheet shows and what a drag starts from. */
	storedStart: number;
	/** The title of the item whose time it made room for, null when it stays. */
	movedFor: string | null;
};

const endOf = (task: { startTime: number; duration: number }) => task.startTime + task.duration;
const overlaps = (
	a: { startTime: number; duration: number },
	b: { startTime: number; duration: number }
) => a.startTime < endOf(b) && b.startTime < endOf(a);

/**
 * The task as the user stored it. Anything that edits, completes, deletes or restores a task from a placed copy goes
 * through this, so showing a task at another time never writes that time. A task that was not placed is returned as is.
 */
export function stored<T extends PlaceTask>(task: T | Placed<T>): T {
	if (!('storedStart' in task)) return task;
	const { storedStart, movedFor: _movedFor, ...rest } = task;
	return { ...rest, startTime: storedStart } as unknown as T;
}

/** Highest priority first, then earlier, then shorter, then lower id, so the placing never flickers. */
const byPlace = (a: PlaceTask, b: PlaceTask) =>
	(b.priority || Priority.Medium) - (a.priority || Priority.Medium) ||
	a.startTime - b.startTime ||
	a.duration - b.duration ||
	a.id - b.id;

const movable = (task: PlaceTask) =>
	(task.kind ?? 'block') === 'block' &&
	task.status !== TaskStatus.Completed &&
	(task.shift ?? 0) > 0;

/**
 * Lets the tasks at a time that may move make room for what cannot (`docs/flow-plan.md` 5.11). Appointments, travel,
 * done tasks and tasks that stay keep their time. The others are placed in priority order: at their own time when
 * nothing placed overlaps it, else at the earliest free start after it within `shift`, else at the latest free start
 * before it within `shift`, on the 15 min grid. When nothing fits the task stays and overlaps as it always did.
 * Pure: the stored time never changes, only the copy returned here.
 */
export function placeDay<T extends PlaceTask>(tasks: T[]): Placed<T>[] {
	const placed = new Map<number, Placed<T>>();
	const taken: PlaceTask[] = [];
	for (const task of tasks.filter((task) => !movable(task))) {
		placed.set(task.id, { ...task, storedStart: task.startTime, movedFor: null });
		taken.push(task);
	}

	const free = (start: number, duration: number) =>
		start >= 0 &&
		start + duration <= 1440 &&
		!taken.some((other) => overlaps({ startTime: start, duration }, other));

	for (const task of tasks.filter(movable).sort(byPlace)) {
		const shift = Math.min(task.shift ?? 0, MAX_SHIFT);
		let start = task.startTime;
		let movedFor: string | null = null;
		if (!free(start, task.duration)) {
			const cause = taken
				.filter((other) => overlaps(task, other))
				.sort((a, b) => a.startTime - b.startTime || a.id - b.id)[0];
			movedFor = cause?.title ?? null;

			const first = Math.floor(task.startTime / PLACE_GRID) * PLACE_GRID;
			let found: number | null = null;
			// Later first: it is the smaller change for the day, and what a meeting that ran over asks for
			for (
				let at = first + PLACE_GRID;
				at <= task.startTime + shift && found === null;
				at += PLACE_GRID
			)
				if (free(at, task.duration)) found = at;
			const last = Math.ceil(task.startTime / PLACE_GRID) * PLACE_GRID - PLACE_GRID;
			for (let at = last; at >= task.startTime - shift && found === null; at -= PLACE_GRID)
				if (free(at, task.duration)) found = at;
			if (found === null) movedFor = null;
			else start = found;
		}
		placed.set(task.id, { ...task, startTime: start, storedStart: task.startTime, movedFor });
		taken.push({ ...task, startTime: start });
	}

	return tasks.map((task) => placed.get(task.id)!);
}
