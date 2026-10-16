/**
 * Will it fit (`docs/flow-plan.md` phase 7). Pure: the free minutes of each day from the placed days and My day, a
 * realistic share of them, and what that says about the to-dos that are due: on track, tight or does not fit.
 */
import { formatMinutes } from '#lib/format.js';
import { remainingMinutes, type PickTodo } from '#lib/pick.js';
import { placeDay, type PlaceTask } from '#lib/placeday.js';
import { addDays } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

/** Nobody works every free minute: this share of them is what a plan may count on. */
export const REALISTIC_SHARE = 0.6;
/** A to-do group that needs more than this share of the realistic free time is tight. */
export const TIGHT_FROM = 0.8;
/** Days looked at, a due date further away is counted as this far. */
export const HORIZON_DAYS = 365;

/** A task of any day. */
export type CapacityTask = PlaceTask & { date: string };

export interface CapacityInput {
	/** Tasks of today and later, done ones included. Earlier days are ignored. */
	tasks: readonly CapacityTask[];
	/** Today, `YYYY-MM-DD`. */
	today: string;
	/** Minutes since midnight. */
	now: number;
	myDayStart: number;
	myDayEnd: number;
	/** Tests set it, the app uses `REALISTIC_SHARE`. */
	share?: number;
}

export interface Capacity {
	/**
	 * The realistic free minutes from now to the end of `date`, or to `time` on it. A date in the past counts as today.
	 * Tasks at a time and appointments are taken off, My day is the frame.
	 */
	until(date: string, time?: number | null): number;
}

/** Free minutes from `from` to `until` (minutes of one day) that no unfinished task holds. */
export function freeBetween(
	tasks: readonly Pick<PlaceTask, 'startTime' | 'duration' | 'status'>[],
	from: number,
	until: number
): number {
	if (until <= from) return 0;
	const spans = tasks
		.filter((task) => task.status !== TaskStatus.Completed)
		.map((task) => [
			Math.max(from, task.startTime),
			Math.min(until, task.startTime + task.duration)
		])
		.filter(([start, end]) => end > start)
		.sort((a, b) => a[0] - b[0]);
	let busy = 0;
	let reached = from;
	for (const [start, end] of spans) {
		busy += Math.max(0, end - Math.max(start, reached));
		reached = Math.max(reached, end);
	}
	return until - from - busy;
}

export function capacityOf(input: CapacityInput): Capacity {
	const { today, now, myDayStart, myDayEnd } = input;
	const share = input.share ?? REALISTIC_SHARE;
	const byDay = new Map<string, CapacityTask[]>();
	for (const task of input.tasks) {
		if (task.date < today) continue;
		byDay.set(task.date, [...(byDay.get(task.date) ?? []), task]);
	}
	// The day as it will be lived: tasks that may move have made room
	const placed = new Map<string, CapacityTask[]>();
	const dayOf = (date: string) => {
		let day = placed.get(date);
		if (!day) {
			day = placeDay(byDay.get(date) ?? []);
			placed.set(date, day);
		}
		return day;
	};
	const free = (date: string, until: number) => {
		const from = date === today ? Math.max(now, myDayStart) : myDayStart;
		return freeBetween(dayOf(date), from, Math.min(until, myDayEnd));
	};

	return {
		until(date, time) {
			const last = date < today ? today : date;
			let total = 0;
			let day = today;
			for (let step = 0; step <= HORIZON_DAYS && day <= last; step++) {
				total += free(day, day === last && time != null ? time : myDayEnd);
				day = addDays(day, 1);
			}
			return Math.round(total * share);
		}
	};
}

export type Fit = 'on-track' | 'tight' | 'no-fit';

export type FitTodo = PickTodo;

export interface Fitting {
	fit: Fit;
	/** Minutes the to-dos due up to and including this one still need. */
	need: number;
	/** The realistic free minutes until this one is due. */
	free: number;
}

/** When a to-do is due, as a sortable pair. A past date counts as today, no time as the end of My day. */
function dueOf(todo: FitTodo, today: string, myDayEnd: number): { date: string; time: number } {
	const date = todo.dueDate! < today ? today : todo.dueDate!;
	return { date, time: todo.dueTime ?? myDayEnd };
}

/**
 * Whether the open to-dos with a due date fit into the free time before they are due. They share it, so each one is
 * judged with everything due before it: the one due first has the free time to itself, the next one what is left.
 */
export function fittings(
	todos: readonly FitTodo[],
	capacity: Capacity,
	today: string,
	myDayEnd: number
): Map<number, Fitting> {
	const due = todos
		.filter((todo) => todo.status === 'open' && todo.dueDate !== null)
		.map((todo) => ({ todo, ...dueOf(todo, today, myDayEnd) }))
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				a.time - b.time ||
				b.todo.priority - a.todo.priority ||
				a.todo.id - b.todo.id
		);
	const result = new Map<number, Fitting>();
	let need = 0;
	for (const { todo, date, time } of due) {
		need += remainingMinutes(todo);
		const free = capacity.until(date, time);
		const ratio = free === 0 ? Infinity : need / free;
		result.set(todo.id, {
			fit: ratio > 1 ? 'no-fit' : ratio > TIGHT_FROM ? 'tight' : 'on-track',
			need,
			free
		});
	}
	return result;
}

/** "about 52 h": whole hours from ten hours on, otherwise the nearest quarter of an hour. */
function about(minutes: number): string {
	const step = minutes >= 600 ? 60 : 15;
	return `about ${formatMinutes(Math.max(step, Math.round(minutes / step) * step))}`;
}

/** `Nov 5`, the date a line names. */
export function shortDate(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

/**
 * One line for Plan when the to-dos that are due by some day need more than that day has: the first such day, say what
 * is needed and what is free. `null` when everything fits, to-dos without a due date are not counted.
 */
export function overbookedLine(
	todos: readonly FitTodo[],
	capacity: Capacity,
	today: string,
	myDayEnd: number
): string | null {
	const due = todos
		.filter((todo) => todo.status === 'open' && todo.dueDate !== null)
		.map((todo) => ({ todo, date: dueOf(todo, today, myDayEnd).date }))
		.sort((a, b) => a.date.localeCompare(b.date));
	let need = 0;
	for (const [index, { todo, date }] of due.entries()) {
		need += remainingMinutes(todo);
		// A day is judged once, with everything due on it
		if (due[index + 1]?.date === date) continue;
		const free = capacity.until(date);
		if (need > free) {
			const when = date === today ? 'today' : `by ${shortDate(date)}`;
			const open = free < 5 ? 'none is free' : `${about(free)} are free`;
			return `Your to-dos due ${when} need ${about(need)}, ${open}.`;
		}
	}
	return null;
}

/** The words under a row of the To do panel, `null` while it is on track or has no date. */
export function fitWords(fitting: Fitting | undefined): string | null {
	if (!fitting || fitting.fit === 'on-track') return null;
	return fitting.fit === 'tight' ? 'Tight' : 'Does not fit';
}
