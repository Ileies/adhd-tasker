import type { Todo } from '#lib/core/repo.js';
import { formatClock } from '#lib/format.js';
import { addDays, type DateKey } from '#lib/time.js';
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

/**
 * The first start after `now` on the grid where `duration` fits between the open `others`, ending by midnight.
 * `others` must not contain the task being moved. Null when nothing fits today.
 */
export function nextFreeSlot<T extends Span & { status: TaskStatus }>(
	others: T[],
	now: number,
	duration: number
): number | null {
	const open = others.filter((task) => task.status !== TaskStatus.Completed);
	let start = Math.ceil(now / SNAP) * SNAP;
	while (start + duration <= DAY_MINUTES) {
		const blocking = open.filter((task) => overlap({ id: 0, startTime: start, duration }, task));
		if (blocking.length === 0) return start;
		const end = Math.max(...blocking.map((task) => task.startTime + task.duration));
		start = Math.ceil(end / SNAP) * SNAP;
	}
	return null;
}

export interface Placement<T extends Span> {
	task: T;
	/** Column within its group of blocks that meet on screen. */
	lane: number;
	/** Columns it covers from `lane` on, more than one when the columns beside it stay free. */
	span: number;
	/** Number of columns in that group, tasks share the width evenly. */
	lanes: number;
	/** True when another task is scheduled at the same time. */
	overlaps: boolean;
}

/**
 * Places tasks side by side instead of on top of each other. Columns follow the blocks as the
 * timeline draws them: from `origin` (see `dayOffset`) and at least `minLength` minutes tall, so a
 * short block that is drawn taller than its time sits beside the next task. A group is a chain of
 * blocks that meet, every task in a group gets the same column count. `overlaps` follows the clock.
 */
export function layoutDay<T extends Span>(
	tasks: T[],
	{ minLength = 0, origin = 0 }: { minLength?: number; origin?: number } = {}
): Placement<T>[] {
	const boxes = tasks
		.map((task) => {
			const top = dayOffset(task.startTime, origin);
			return { task, top, bottom: top + Math.max(task.duration, minLength) };
		})
		.sort((a, b) => a.top - b.top || b.task.duration - a.task.duration || a.task.id - b.task.id);
	type Box = (typeof boxes)[number] & { lane: number };
	const meet = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
		a.top < b.bottom && b.top < a.bottom;
	const placements: Placement<T>[] = [];
	let group: Box[] = [];
	let groupBottom = -1;

	const closeGroup = () => {
		const lanes = Math.max(1, ...group.map((box) => box.lane + 1));
		for (const box of group) {
			let span = 1;
			while (
				box.lane + span < lanes &&
				!group.some((other) => other.lane === box.lane + span && meet(other, box))
			)
				span++;
			const overlaps = tasks.some((other) => other !== box.task && overlap(other, box.task));
			placements.push({ task: box.task, lane: box.lane, span, lanes, overlaps });
		}
		group = [];
	};

	for (const box of boxes) {
		if (group.length > 0 && box.top >= groupBottom) closeGroup();
		let lane = 0;
		while (group.some((other) => other.lane === lane && meet(other, box))) lane++;
		group.push({ ...box, lane });
		groupBottom = Math.max(groupBottom, box.bottom);
	}
	closeGroup();
	return placements;
}

/**
 * The to-do "Do it when there is time" makes of a task that ran out: the same title, note and priority, its length
 * as the size. It has no day or time, the app finds the time for it.
 */
export function todoFromTask(
	task: Pick<Task, 'title' | 'description' | 'priority' | 'duration'>
): Pick<Todo, 'title' | 'description' | 'priority' | 'estimate'> {
	return {
		title: task.title,
		description: task.description,
		priority: task.priority,
		estimate: task.duration
	};
}

/**
 * Where "Move to later" puts a task: the next free slot today, or, when nothing fits before midnight,
 * the same start time tomorrow. `others` are today's tasks without the one being moved.
 */
export function moveLater<T extends Span & { status: TaskStatus }>(
	task: Pick<Task, 'startTime' | 'duration'>,
	others: T[],
	today: DateKey,
	now: number
): { date: DateKey; startTime: number; tomorrow: boolean } {
	const slot = nextFreeSlot(others, now, task.duration);
	return slot === null
		? { date: addDays(today, 1), startTime: task.startTime, tomorrow: true }
		: { date: today, startTime: slot, tomorrow: false };
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

/** The hours Plan shows by default (07:00 to 23:00) until the My day setting exists. */
export const MY_DAY = { start: 7 * 60, end: 23 * 60 };

/**
 * The timeline starts where the night starts (My day end), not at midnight: the offset of a time
 * is how far it is from that origin. 23:00 is 0, midnight is 60, 07:00 is 480, 22:59 is 1439.
 */
export function dayOffset(minutes: number, origin = MY_DAY.end): number {
	return (((minutes - origin) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** The offset of midnight: tasks never cross it, so the night is two blocks either side of it. */
export function midnightOffset(origin = MY_DAY.end): number {
	return (DAY_MINUTES - origin) % DAY_MINUTES;
}

/** The time of day (minutes since midnight) at an offset on the timeline. */
export function timeAtOffset(offset: number, origin = MY_DAY.end): number {
	const midnight = midnightOffset(origin);
	return offset < midnight ? offset + origin : offset - midnight;
}

/**
 * The part of the timeline that is shown in full. The night (from `day.end` round to `day.start`)
 * folds into one thin row at the top, widened to whole hours around every task in it so that
 * nothing planned at night is hidden. All values are offsets, see `dayOffset`.
 */
export function timelineRange(
	tasks: Pick<Task, 'startTime' | 'duration'>[],
	day = MY_DAY
): { night: number; from: number; to: number } {
	const night = dayOffset(day.start, day.end);
	let from = night;
	let to = DAY_MINUTES;
	for (const task of tasks) {
		const start = dayOffset(task.startTime, day.end);
		if (start < night) from = Math.min(from, Math.floor(start / 60) * 60);
		// A task that runs across the end of the day makes the timeline longer
		to = Math.max(to, Math.ceil((start + task.duration) / 60) * 60);
	}
	return { night, from, to };
}

/**
 * Where a task lands when it is dragged by `delta` minutes on the timeline, as a time of day. It
 * stays on its side of midnight: a task never crosses it.
 */
export function moveOnTimeline(
	startTime: number,
	duration: number,
	delta: number,
	origin = MY_DAY.end
): number {
	const midnight = midnightOffset(origin);
	const offset = dayOffset(startTime, origin);
	if (offset < midnight) {
		return timeAtOffset(snap(Math.max(0, Math.min(midnight - duration, offset + delta))), origin);
	}
	return moveTo(Math.max(midnight, offset + delta) - midnight, duration);
}

/** What arrow keys do to a focused block: up and down move by one step, with Shift they resize. Null for any other key. */
export function keyAdjust(
	task: Pick<Task, 'startTime' | 'duration'>,
	key: string,
	shift: boolean
): { startTime: number } | { duration: number } | null {
	if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
	const step = key === 'ArrowUp' ? -SNAP : SNAP;
	return shift
		? { duration: resizeTo(task.startTime, task.duration + step) }
		: { startTime: moveTo(task.startTime + step, task.duration) };
}

type Named = Span & { title: string; priority: Task['priority']; status: TaskStatus };

/** Open tasks that overlap in a chain, each group at least two tasks, by start time. */
function overlapGroups<T extends Named>(tasks: T[]): T[][] {
	const open = tasks
		.filter((task) => task.status !== TaskStatus.Completed)
		.sort((a, b) => a.startTime - b.startTime || a.id - b.id);
	const groups: T[][] = [];
	let group: T[] = [];
	let end = -1;
	for (const task of open) {
		if (group.length > 0 && task.startTime >= end) {
			if (group.length > 1) groups.push(group);
			group = [];
		}
		group.push(task);
		end = Math.max(end, task.startTime + task.duration);
	}
	if (group.length > 1) groups.push(group);
	return groups;
}

/**
 * The warning above the timeline, naming the tasks and the winner: "Study and Dinner overlap at 18:00.
 * Now shows Dinner (higher priority)." Null when nothing overlaps. Done tasks do not count.
 */
export function overlapLine<T extends Named>(tasks: T[]): string | null {
	const groups = overlapGroups(tasks);
	const [first] = groups;
	if (!first) return null;
	const at = first[1].startTime;
	const running = first.filter(
		(task) => task.startTime <= at && at < task.startTime + task.duration
	);
	const winner = [...running].sort(
		(a, b) => b.priority - a.priority || a.startTime - b.startTime || a.id - b.id
	)[0];
	const names = first.map((task) => task.title);
	const list =
		names.length === 2
			? names.join(' and ')
			: `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	const why = running.some((task) => task.priority < winner.priority)
		? 'higher priority'
		: 'it starts first';
	const more =
		groups.length > 1 ? ` ${groups.length - 1} more overlap${groups.length > 2 ? 's' : ''}.` : '';
	return `${list} overlap at ${formatClock(at)}. Now shows ${winner.title} (${why}).${more}`;
}

export interface PhoneGroups<T> {
	/** Finished tasks, shown as one line. */
	done: T[];
	/** Open tasks whose time passed without an answer. */
	missed: T[];
	/** Open tasks running now. */
	current: T[];
	/** Everything else, or the whole day when it is not today. */
	later: T[];
}

/** Splits a day for the phone list. `now` is null for a day that is not today: one plain list. */
export function phoneGroups<T extends Span & { status: TaskStatus }>(
	tasks: T[],
	now: number | null
): PhoneGroups<T> {
	const sorted = [...tasks].sort((a, b) => a.startTime - b.startTime || a.id - b.id);
	const groups: PhoneGroups<T> = { done: [], missed: [], current: [], later: [] };
	if (now === null) {
		groups.later = sorted;
		return groups;
	}
	for (const task of sorted) {
		if (task.status === TaskStatus.Completed) groups.done.push(task);
		else if (task.startTime + task.duration <= now) groups.missed.push(task);
		else if (task.startTime <= now) groups.current.push(task);
		else groups.later.push(task);
	}
	return groups;
}
