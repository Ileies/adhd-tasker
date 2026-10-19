/**
 * Which to-do gets the next session (`docs/flow-plan.md` 5.3). Pure: the engine hands in the open to-dos, what was
 * worked on today and how many minutes are left to fill, and gets one to-do back with the line that says why.
 *
 * Urgent ones first (due today and not fitting any more), the rest by fair share: the minutes of today that are left are split by
 * how much each to-do needs per day left and how important it is, and the one furthest behind its share goes next.
 */
import type { Capacity } from '#lib/capacity.js';
import { formatClock, formatMinutes } from '#lib/format.js';
import type { Todo } from '#lib/core/repo.js';
import { LOW_ENERGY_MAX_LEFT } from '#lib/struggle.js';

export type PickTodo = Pick<
	Todo,
	| 'id'
	| 'title'
	| 'priority'
	| 'estimate'
	| 'progress'
	| 'dueDate'
	| 'dueTime'
	| 'notBefore'
	| 'status'
> &
	/** What pushing it away counted, absent in a test that is not about it. */
	Partial<Pick<Todo, 'skips' | 'skipSince' | 'parentId'>>;

/** The line for a to-do picked in the low energy hour. */
export const LOW_ENERGY_LINE = 'A short one while energy is low.';

/** A to-do that is due today must still fit with this much to spare, otherwise it is urgent. */
const URGENT_SPARE_MINUTES = 30;
/** A to-do without a due date is spread over this many days, so it still has a small need. */
const DAYS_WITHOUT_DUE = 30;
/** What a to-do of unknown size is assumed to take, in minutes. */
const UNKNOWN_SIZE = 60;
/** The least a to-do has left to do, however far it is. */
const MIN_REMAINING = 5;
/** Every to-do needs at least this much a day (or what is left of it), so a small one without a date is not starved by big ones. */
const MIN_NEED_MINUTES = 15;
/** The to-do of the last session stays while it had less than this many minutes today. */
export const CONTINUITY_MAX_MINUTES = 120;
/** Weight by priority 1 (low) to 5 (critical). */
const WEIGHT: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };

export interface PickInput<D extends PickTodo> {
	/** Every to-do, any status: the picker takes the open ones that are due to be worked on. */
	todos: D[];
	/** Today, `YYYY-MM-DD`. */
	date: string;
	/** Minutes since midnight. */
	now: number;
	/** End of My day in minutes since midnight, the due time of a to-do that has none. */
	myDayEnd: number;
	/** Minutes worked on each to-do today, by id. */
	spent: ReadonlyMap<number, number>;
	/** The to-do of the session before, null at the first one. */
	previousId: number | null;
	/** Free minutes from now to the end of My day, appointments and tasks at a time taken off. */
	freeLeft: number;
	/** Free minutes from now to a minute of today. */
	freeUntil(minute: number): number;
	/**
	 * The realistic free time of every day until a date (`capacity.ts`). With it a to-do due later is urgent when it no
	 * longer fits into that time, and its need today is its share of the free time left, not of the calendar days.
	 * Without it only today's minutes are known.
	 */
	capacity?: Pick<Capacity, 'until'>;
	/** To-dos the user was rotated away from lately, left alone unless nothing else is open. */
	cooling?: ReadonlySet<number>;
	/** The low energy hour: only to-dos with at most `LOW_ENERGY_MAX_LEFT` minutes left, unless there are none. */
	shortOnly?: boolean;
}

type PickWhy = 'urgent' | 'only' | 'continuity' | 'share' | 'short';

export interface Picked<D> {
	todo: D;
	why: PickWhy;
	/** One calm line for the hero, says what decided. */
	line: string;
}

/** Whole days from `from` to `to` (`YYYY-MM-DD`), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Minutes of work left on a to-do: its size times what is left of the bar, an unknown size counts as an hour. */
export function remainingMinutes(todo: Pick<PickTodo, 'estimate' | 'progress'>): number {
	const size = todo.estimate ?? UNKNOWN_SIZE;
	return Math.max(MIN_REMAINING, Math.round((size * (100 - todo.progress)) / 100));
}

/** Open and not held back by a "not before" date. */
export function isCandidate(todo: Pick<PickTodo, 'status' | 'notBefore'>, date: string): boolean {
	return todo.status === 'open' && (todo.notBefore === null || todo.notBefore <= date);
}

/** The minute of today a to-do is due, a date in the past counts as today's end. `null` without a due date. */
function dueMinute(todo: PickTodo, date: string, myDayEnd: number): number | null {
	if (todo.dueDate === null) return null;
	if (todo.dueDate < date) return myDayEnd;
	return todo.dueDate === date ? (todo.dueTime ?? myDayEnd) : null;
}

/** Days left until due, today included, at least one. */
function daysLeft(todo: PickTodo, date: string): number {
	if (todo.dueDate === null) return DAYS_WITHOUT_DUE;
	return Math.max(1, daysBetween(date, todo.dueDate) + 1);
}

/** "Due today", "Due tomorrow", "Due in 12 days" or "Overdue", for a date counted from today. */
function dueWords(dueDate: string, date: string): string {
	const days = daysBetween(date, dueDate);
	if (days < 0) return 'Overdue';
	if (days === 0) return 'Due today';
	return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

/**
 * The part of a to-do's remaining work that belongs to today. With the realistic free time known it is today's part of
 * the free time until the due date, so days that are full of appointments do not count; otherwise one calendar day's part.
 */
function todayShare(todo: PickTodo, input: Pick<PickInput<PickTodo>, 'date' | 'capacity'>): number {
	if (input.capacity && todo.dueDate !== null && todo.dueDate > input.date) {
		const total = input.capacity.until(todo.dueDate, todo.dueTime);
		return total > 0 ? Math.min(1, input.capacity.until(input.date) / total) : 1;
	}
	return 1 / daysLeft(todo, input.date);
}

const ceilTo5 = (minutes: number) => Math.max(5, Math.ceil(minutes / 5) * 5);

function urgentLine(todo: PickTodo, date: string, remaining: number): string {
	const later = todo.dueDate !== null && todo.dueDate > date;
	const when =
		todo.dueDate !== null && todo.dueDate < date
			? 'Overdue'
			: later
				? dueWords(todo.dueDate!, date)
				: todo.dueTime !== null
					? `Due at ${formatClock(todo.dueTime)}`
					: 'Due today';
	return `${when}, about ${formatMinutes(remaining)} left to do${later ? ', more than is free until then' : ''}.`;
}

/**
 * The to-dos a session may go to: the open ones that are ready, without the ones that cool down and, in the low energy
 * hour, only the short ones. With none left the cool down is dropped first and then the low energy filter.
 */
function candidatesFor<D extends PickTodo>(
	input: Pick<PickInput<D>, 'todos' | 'date' | 'cooling' | 'shortOnly'>
): D[] {
	const ready = input.todos.filter((todo) => isCandidate(todo, input.date));
	const short = (todo: D) => remainingMinutes(todo) <= LOW_ENERGY_MAX_LEFT;
	const warm = (todo: D) => !input.cooling?.has(todo.id);
	const attempts: ((todo: D) => boolean)[] = [
		(todo) => warm(todo) && (!input.shortOnly || short(todo)),
		(todo) => !input.shortOnly || short(todo),
		() => true
	];
	for (const accepts of attempts) {
		const found = ready.filter(accepts);
		if (found.length > 0) return found;
	}
	return [];
}

/** How many other to-dos a rotation away from `todoId` could go to: open, ready and not cooling down. */
export function rotationTargets(
	todos: readonly Pick<PickTodo, 'id' | 'status' | 'notBefore'>[],
	date: string,
	cooling: ReadonlySet<number>,
	todoId: number
): number {
	return todos.filter(
		(todo) => todo.id !== todoId && isCandidate(todo, date) && !cooling.has(todo.id)
	).length;
}

/** The to-do for the next session, `null` when none is open and ready. */
export function pick<D extends PickTodo>(input: PickInput<D>): Picked<D> | null {
	const picked = choose(input);
	// In the low energy hour a short to-do says so, an urgent one still says why it is urgent
	if (
		picked &&
		input.shortOnly &&
		picked.why !== 'urgent' &&
		remainingMinutes(picked.todo) <= LOW_ENERGY_MAX_LEFT
	)
		return { ...picked, why: 'short', line: LOW_ENERGY_LINE };
	return picked;
}

/**
 * What stopping for the day costs, one plain line for "Call it a day", `null` when it costs nothing: the to-do is not
 * behind its share of today, or it has no date to be late for. `spentToday` is the time it had today.
 */
export function dayCostLine(todo: PickTodo, date: string, spentToday: number): string | null {
	if (todo.dueDate === null) return null;
	const left = remainingMinutes(todo);
	const days = daysLeft(todo, date);
	const today = Math.max(left / days, Math.min(left, MIN_NEED_MINUTES));
	const behind = Math.ceil((today - spentToday) / 5) * 5;
	if (behind < 15) return null;
	if (days <= 1)
		return `${todo.title} is due today, about ${formatMinutes(left)} of it is still open.`;
	return `${todo.title} is ${formatMinutes(behind)} behind today, tomorrow needs ${formatMinutes(ceilTo5(left / (days - 1)))} for it.`;
}

function choose<D extends PickTodo>(input: PickInput<D>): Picked<D> | null {
	const { date, now, myDayEnd, spent } = input;
	const candidates = candidatesFor(input);
	if (candidates.length === 0) return null;

	const remaining = new Map(candidates.map((todo) => [todo.id, remainingMinutes(todo)]));
	const spentOf = (todo: D) => spent.get(todo.id) ?? 0;

	// Urgent: due today, and what is left no longer fits before it with time to spare. A to-do due later is urgent
	// when it does not fit into the realistic free time until then, if that is known.
	const noRoom = (todo: D, due: number | null) => {
		const left = remaining.get(todo.id)! + URGENT_SPARE_MINUTES;
		if (due !== null) return left > input.freeUntil(Math.max(now, due));
		return (
			input.capacity !== undefined &&
			todo.dueDate !== null &&
			left > input.capacity.until(todo.dueDate, todo.dueTime)
		);
	};
	const urgent = candidates
		.map((todo) => {
			const due = dueMinute(todo, date, myDayEnd);
			return { todo, due: due ?? todo.dueTime ?? myDayEnd, noRoom: noRoom(todo, due) };
		})
		.filter((entry) => entry.todo.dueDate !== null && entry.noRoom)
		.sort(
			(a, b) =>
				(a.todo.dueDate ?? '').localeCompare(b.todo.dueDate ?? '') ||
				a.due - b.due ||
				a.todo.id - b.todo.id
		);
	if (urgent.length > 0) {
		const { todo } = urgent[0];
		return {
			todo,
			why: 'urgent',
			line: urgentLine(todo, date, remaining.get(todo.id)!)
		};
	}

	// The rest share what is left of today by need and weight, the one furthest behind goes next
	const rest = candidates;
	const pool = input.freeLeft + rest.reduce((sum, todo) => sum + spentOf(todo), 0);
	const need = (todo: D) => {
		const left = remaining.get(todo.id)!;
		return Math.max(left * todayShare(todo, input), Math.min(left, MIN_NEED_MINUTES));
	};
	const weight = (todo: D) => need(todo) * (WEIGHT[todo.priority] ?? WEIGHT[3]);
	const total = rest.reduce((sum, todo) => sum + weight(todo), 0);
	const behind = new Map(
		rest.map((todo) => [todo.id, (pool * weight(todo)) / total - spentOf(todo)])
	);

	const previous = rest.find((todo) => todo.id === input.previousId);
	if (
		rest.length > 1 &&
		previous &&
		behind.get(previous.id)! > 0 &&
		spentOf(previous) < CONTINUITY_MAX_MINUTES
	)
		return {
			todo: previous,
			why: 'continuity',
			line: 'Staying with it, it still needs the most time today.'
		};

	const [todo] = [...rest].sort(
		(a, b) =>
			behind.get(b.id)! - behind.get(a.id)! ||
			(a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
			a.id - b.id
	);
	if (rest.length === 1) return { todo, why: 'only', line: 'Nothing else is open.' };

	const days = todo.dueDate === null ? null : daysLeft(todo, date);
	const perDay = ceilTo5(remaining.get(todo.id)! * todayShare(todo, input));
	return {
		todo,
		why: 'share',
		line:
			days === null
				? 'Nothing is due, it has had the least time today.'
				: `${dueWords(todo.dueDate!, date)}. About ${formatMinutes(perDay)} today keeps you on track.`
	};
}
