import { TaskStatus, type Task } from '#lib/types.js';

export const DAY_MINUTES = 1440;
export const SNAP = 15;
export const MIN_DURATION = 15;

/** Rounds to the nearest grid step. */
export function snap(minutes: number, step = SNAP): number {
	return Math.round(minutes / step) * step;
}

/** Moves a task to `start` snapped to the grid, kept inside the day. Tasks do not cross midnight. */
export function moveTo(start: number, duration: number): number {
	return Math.min(DAY_MINUTES - duration, Math.max(0, snap(start)));
}

/** Resizes to `duration` snapped to the grid, at least one step and ending by midnight at the latest. */
export function resizeTo(start: number, duration: number): number {
	return Math.min(DAY_MINUTES - start, Math.max(MIN_DURATION, snap(duration)));
}

/**
 * The duration after giving a task `minutes` more: from the later of its end and `now`, so a
 * missed task gets them from now and a running one on top of its end. Ends by midnight at the latest.
 */
export function extendTask(
	task: Pick<Task, 'startTime' | 'duration'>,
	now: number,
	minutes: number
): number {
	const end = Math.max(task.startTime + task.duration, now) + minutes;
	return Math.max(task.duration, Math.min(DAY_MINUTES, end) - task.startTime);
}
type Span = Pick<Task, 'id' | 'startTime' | 'duration'>;

const overlap = (a: Span, b: Span) =>
	a.startTime < b.startTime + b.duration && b.startTime < a.startTime + a.duration;

export interface Placement<T extends Span> {
	task: T;
	/** Column within its group of overlapping tasks. */
	lane: number;
	/** Number of columns in that group, tasks share the width evenly. */
	lanes: number;
	/** True when another task is scheduled at the same time. */
	overlaps: boolean;
}

/**
 * Places tasks side by side instead of stacking them, so overlaps are visible.
 * A group is a chain of tasks that overlap each other, every task in a group gets the same column count.
 */
export function layoutDay<T extends Span>(tasks: T[]): Placement<T>[] {
	const sorted = [...tasks].sort(
		(a, b) => a.startTime - b.startTime || b.duration - a.duration || a.id - b.id
	);
	const placements: Placement<T>[] = [];
	let group: Placement<T>[] = [];
	let groupEnd = -1;

	const closeGroup = () => {
		const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
		for (const placement of group) {
			placement.lanes = lanes;
			placement.overlaps = lanes > 1;
		}
		placements.push(...group);
		group = [];
	};

	for (const task of sorted) {
		if (group.length > 0 && task.startTime >= groupEnd) closeGroup();
		let lane = 0;
		while (group.some((p) => p.lane === lane && overlap(p.task, task))) lane++;
		group.push({ task, lane, lanes: 1, overlaps: false });
		groupEnd = Math.max(groupEnd, task.startTime + task.duration);
	}
	closeGroup();
	return placements;
}

/** Open tasks that overlap `task`, used for the warning when scheduling. */
export function conflictsWith<T extends Span & { status: TaskStatus }>(
	task: Span,
	others: T[]
): T[] {
	return others.filter(
		(other) => other.id !== task.id && other.status !== TaskStatus.Completed && overlap(task, other)
	);
}
