/**
 * The flow engine: what the user is doing right now and why (`docs/flow-plan.md` 3.3). Pure, shared by the screen,
 * the server tick and the guest's tick, so the three can never disagree.
 *
 * Nothing is stored for "current". It is replayed from today's points in time: what the user said (the flow log),
 * what they finished (`completedAt` of tasks and to-dos) and when time-bound items ended. The only thing the engine
 * asks to have written is a pin, which freezes the to-do of a session so that adding or editing a to-do halfway
 * through does not change what is current.
 *
 * Phase 1: time-bound items first, then sessions of fixed length on the to-do `pick()` chooses, presence from Start
 * and Done, plan, ready, rest and night. Checks, breaks, rotation and Away come with the next phases.
 */
import type { FlowRow } from '#lib/core/repo.js';
import { TIME_UP_WINDOWS, timeBoundState } from '#lib/now.js';
import { pick, type PickTodo } from '#lib/pick.js';
import { rank, type RankTask } from '#lib/priority.js';
import { TaskStatus } from '#lib/types.js';

/** A session ends and the next one is picked after this many minutes. */
export const SESSION_MINUTES = 30;
/** Less than this many minutes before a time-bound item nothing new is started: the hero says get ready. */
export const READY_MINUTES = 10;

const MINUTE_MS = 60_000;

export type FlowTask = RankTask & { completedAt: number | null };
export type FlowTodo = PickTodo & { completedAt: number | null };
export type FlowLogRow = Pick<FlowRow, 'id' | 'at' | 'type' | 'todoId' | 'data' | 'key'>;

export interface FlowSettings {
	/** Minutes since midnight. */
	myDayStart: number;
	myDayEnd: number;
	overrunMinutes: number;
}

export interface FlowInput<T extends FlowTask, D extends FlowTodo> {
	/** Today, `YYYY-MM-DD` in the user's timezone. */
	date: string;
	/** Minutes since midnight in the user's timezone. */
	now: number;
	nowMs: number;
	/** The epoch ms of a minute of today (past 1440 for the next day), daylight saving included. */
	at(minutes: number): number;
	/** Today's tasks, done ones included. */
	tasks: T[];
	/** Every open to-do and the ones finished recently. */
	todos: D[];
	/** Today's rows of the flow log. */
	log: FlowLogRow[];
	settings: FlowSettings;
}

/** A stretch of work on one to-do, in epoch ms. `end` is the planned end, a session is cut short by a time-bound item. */
export interface Session {
	start: number;
	end: number;
	/** Minutes it was meant to run. */
	length: number;
}

export type Current<T, D> =
	/** A task at a time or an appointment runs now. `wrapping`: its last minutes. */
	| { kind: 'task'; task: T; left: number; wrapping: boolean }
	/** `ended` ran out unanswered. With a `current` that task shows under a transition bar. */
	| { kind: 'time-up'; ended: T; over: number; current: T | null }
	| { kind: 'todo'; todo: D; session: Session }
	/** Less than ten minutes before the next time-bound item. */
	| { kind: 'ready'; next: T }
	/** `since` is null before the first thing the user did today: the morning. */
	| { kind: 'away'; since: number | null }
	/** Nothing is open: plan what is next. */
	| { kind: 'plan' }
	| { kind: 'rest'; why: 'night' | 'called' };

export interface FlowState<T, D> {
	current: Current<T, D>;
	/** Upcoming time-bound items today, in time order. */
	next: T[];
	/** Tasks whose time ran out unanswered, most recent first. */
	missed: T[];
	/** Why this is current, one line, `null` when the user chose it or nothing needs saying. */
	reason: string | null;
	/** A session whose to-do nobody pinned yet. The first device or tick to see it writes this row. */
	pin: { key: string; todoId: number } | null;
	/** The user did something today, so sessions run. */
	present: boolean;
}

/** `pin:<session start ms>`, with `:<n>` when the first pins of that session point at a to-do that is gone. */
export const pinKey = (start: number, attempt = 0) =>
	attempt === 0 ? `pin:${start}` : `pin:${start}:${attempt}`;

/** The start of the session a pin row belongs to, `null` for any other key. */
export function pinStart(key: string | null): number | null {
	const match = /^pin:(\d{1,16})(?::\d{1,3})?$/.exec(key ?? '');
	return match ? Number(match[1]) : null;
}

/** What the next tick compares against (`users.lastCurrentKey`): the kind and, where there is one, the item. */
export function currentKey(current: Current<{ id: number }, { id: number }>): string {
	switch (current.kind) {
		case 'task':
			return `task:${current.task.id}`;
		case 'time-up':
			return current.current ? `task:${current.current.id}` : `time-up:${current.ended.id}`;
		case 'todo':
			return `todo:${current.todo.id}`;
		case 'rest':
			return current.why === 'night' ? 'night' : 'rest';
		default:
			return current.kind;
	}
}

const isDone = (item: { status: string; completedAt: number | null }) =>
	(item.status === TaskStatus.Completed || item.status === 'done') && item.completedAt !== null;

/** Free minutes from `from` to `until` (minutes of today) that no unfinished task holds. */
function freeBetween(tasks: RankTask[], from: number, until: number): number {
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

/** Decides what is current. See the file comment. */
export function flow<T extends FlowTask, D extends FlowTodo>(
	input: FlowInput<T, D>
): FlowState<T, D> {
	const { date, now, nowMs, at, tasks, todos, settings } = input;
	const length = SESSION_MINUTES * MINUTE_MS;
	const dayStart = at(0);
	const dayEnd = at(1440);
	const inDay = (ms: number | null): ms is number => ms !== null && ms >= dayStart && ms < dayEnd;

	// A row an undo points at is as good as never written
	const undone = new Set(input.log.filter((row) => row.type === 'undo').map((row) => row.data.ref));
	const rows = input.log.filter((row) => row.type !== 'undo' && !undone.has(row.id));
	const undoRows = input.log.filter((row) => row.type === 'undo');

	const startRows = rows.filter((row) => row.type === 'start' || row.type === 'choose');
	const doneAts = [...tasks, ...todos]
		.filter((item) => isDone(item) && inDay(item.completedAt))
		.map((item) => item.completedAt!);
	const presenceAt = Math.min(...startRows.map((row) => row.at), ...doneAts);
	const present = Number.isFinite(presenceAt);

	const ranking = rank(tasks, now);
	const timeBound = timeBoundState(ranking, now, settings);
	const base = { next: ranking.upcoming, missed: ranking.missed, present };
	const none = { reason: null, pin: null };

	if (timeBound?.kind === 'active' || timeBound?.kind === 'wrapping-up')
		return {
			...base,
			...none,
			current: {
				kind: 'task',
				task: timeBound.task,
				left: timeBound.left,
				wrapping: timeBound.kind === 'wrapping-up'
			}
		};
	if (timeBound?.kind === 'time-up')
		return {
			...base,
			...none,
			current: {
				kind: 'time-up',
				ended: timeBound.ended,
				over: timeBound.over,
				current: timeBound.current
			}
		};

	if (now < settings.myDayStart || now >= settings.myDayEnd)
		return { ...base, ...none, current: { kind: 'rest', why: 'night' } };

	const lastRest = rows.findLast((row) => row.type === 'rest');
	const lastChoice = rows.findLast((row) => row.type === 'start' || row.type === 'choose');
	if (lastRest && (!lastChoice || lastChoice.at < lastRest.at))
		return { ...base, ...none, current: { kind: 'rest', why: 'called' } };

	if (!present) return { ...base, ...none, current: { kind: 'away', since: null } };

	const upcoming = ranking.upcoming[0];
	if (upcoming && upcoming.startTime - now < READY_MINUTES)
		return { ...base, ...none, current: { kind: 'ready', next: upcoming } };

	// The session: it starts at the latest point in time and runs in steps of its length from there
	const points = [
		...startRows.map((row) => row.at),
		...undoRows.map((row) => row.at),
		...doneAts,
		// A task that ran out unanswered gives the screen back when its time up is over
		...tasks
			.filter((task) => task.status !== TaskStatus.Completed)
			.map(
				(task) =>
					at(task.startTime + task.duration) + TIME_UP_WINDOWS * settings.overrunMinutes * MINUTE_MS
			)
	].filter((point) => point <= nowMs);
	const anchor = points.length > 0 ? Math.max(...points) : presenceAt;
	const start = anchor + Math.floor(Math.max(0, nowMs - anchor) / length) * length;
	const upcomingMs = upcoming ? at(upcoming.startTime) : Infinity;
	const session: Session = {
		start,
		end: Math.min(start + length, upcomingMs, at(settings.myDayEnd)),
		length: SESSION_MINUTES
	};

	// Sessions so far today: what was pinned or chosen, and for how long it really ran
	const sessionRows = rows
		.flatMap((row) => {
			const rowStart =
				row.type === 'choose' ? row.at : row.type === 'pin' ? pinStart(row.key) : null;
			return rowStart === null || row.todoId === null
				? []
				: [{ start: rowStart, todoId: row.todoId, at: row.at }];
		})
		.sort((a, b) => a.start - b.start || a.at - b.at);
	const cuts = [
		...doneAts,
		...rows.filter((row) => row.type === 'rest').map((row) => row.at),
		...tasks
			.filter((task) => !isDone(task) || task.completedAt! > at(task.startTime))
			.map((task) => at(task.startTime)),
		at(settings.myDayEnd),
		nowMs
	];
	const spent = new Map<number, number>();
	sessionRows.forEach((entry, index) => {
		const end = Math.min(
			entry.start + length,
			sessionRows.find((other, at2) => at2 > index && other.start > entry.start)?.start ?? Infinity,
			...cuts.filter((cut) => cut > entry.start)
		);
		if (end > entry.start)
			spent.set(
				entry.todoId,
				(spent.get(entry.todoId) ?? 0) + Math.round((end - entry.start) / MINUTE_MS)
			);
	});

	const open = (id: number | null) =>
		todos.find((todo) => todo.id === id && todo.status === 'open');

	// Chosen by the user at this very moment ("Do this now")
	const choice = rows.find((row) => row.type === 'choose' && row.at === start);
	const chosen = open(choice?.todoId ?? null);
	if (choice && chosen)
		return { ...base, ...none, current: { kind: 'todo', todo: chosen as D, session } };

	// Pinned: the first pin of this session that still points at an open to-do wins
	let attempt = 0;
	while (rows.some((row) => row.key === pinKey(start, attempt))) {
		const row = rows.find((candidate) => candidate.key === pinKey(start, attempt))!;
		const pinned = open(row.todoId);
		if (pinned) {
			const decided = pickFor(session.start, spent);
			return {
				...base,
				reason: decided && decided.todo.id === pinned.id ? decided.line : null,
				pin: null,
				current: { kind: 'todo', todo: pinned as D, session }
			};
		}
		attempt++;
	}

	const decided = pickFor(start, spent);
	if (!decided) return { ...base, ...none, current: { kind: 'plan' } };
	return {
		...base,
		reason: decided.line,
		pin: { key: pinKey(start, attempt), todoId: decided.todo.id },
		current: { kind: 'todo', todo: decided.todo as D, session }
	};

	/** The pick for the session starting at `sessionStart`, continuing with the to-do of the session before. */
	function pickFor(sessionStart: number, spentToday: ReadonlyMap<number, number>) {
		const before = sessionRows.findLast((entry) => entry.start < sessionStart);
		return pick({
			todos,
			date,
			now,
			myDayEnd: settings.myDayEnd,
			spent: spentToday,
			previousId: before?.todoId ?? null,
			freeLeft: freeBetween(tasks, now, settings.myDayEnd),
			freeUntil: (minute) => freeBetween(tasks, now, minute)
		});
	}
}
