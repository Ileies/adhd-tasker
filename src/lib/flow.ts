/**
 * The flow engine: what the user is doing right now and why (`docs/flow-plan.md` 3.3). Pure, shared by the screen,
 * the server tick and the guest's tick, so the three can never disagree.
 *
 * Nothing is stored for "current". It is replayed from today's points in time: what the user said (the flow log),
 * what they finished (`completedAt` of tasks and to-dos) and when time-bound items ended. The only thing the engine
 * asks to have written is a pin, which freezes the to-do of a session so that adding or editing a to-do halfway
 * through does not change what is current.
 *
 * Time-bound items first, then sessions on the to-do `pick()` chooses. A session starts at a point of the user (Start,
 * a check answered, Done, Do this now) or when a time-bound item ends, and runs for the check interval. Then the check
 * is due: "How far is Study B?". Unanswered it is asked again after two minutes and after five the user is away.
 * Presence is not stored, the fold below derives it. Breaks and rotation come with the next phase.
 */
import {
	ANSWER_GRACE_MINUTES,
	isGoodAnswer,
	sessionMinutes,
	workedMinutes,
	type Check,
	type CheckData
} from '#lib/checks.js';
import type { FlowRow } from '#lib/core/repo.js';
import { TIME_UP_WINDOWS, timeBoundState, type HeroState } from '#lib/now.js';
import { pick, type PickTodo } from '#lib/pick.js';
import { rank, type RankTask } from '#lib/priority.js';
import { TaskStatus } from '#lib/types.js';

/** Less than this many minutes before a time-bound item nothing new is started: the hero says get ready. */
export const READY_MINUTES = 10;
/** A session that a time-bound item cuts short is asked about this many minutes before the item... */
export const EARLY_CHECK_MINUTES = 15;
/** ...but only when this many minutes passed since the session started. */
export const EARLY_CHECK_GAP_MINUTES = 10;
/** An unanswered check is asked again after this many minutes ("Still there?")... */
export const ASK_AGAIN_MINUTES = 2;
/** ...and after this many the user is away. */
export const AWAY_MINUTES = 5;

const MINUTE_MS = 60_000;

export type FlowTask = RankTask & { completedAt: number | null };
export type FlowTodo = PickTodo & { completedAt: number | null };
export type FlowLogRow = Pick<FlowRow, 'id' | 'at' | 'type' | 'todoId' | 'data' | 'key'>;

export interface FlowSettings {
	/** Minutes since midnight. */
	myDayStart: number;
	myDayEnd: number;
	overrunMinutes: number;
	/** How long a session runs before the check, in minutes. */
	checkMinutes: number;
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
	/**
	 * `since` is null before the first thing the user did today: the morning. Otherwise the minute a check went
	 * unanswered for too long. `todo` is what the last session was on and `from` (epoch ms) when it started.
	 */
	| { kind: 'away'; since: number | null; todo: D | null; from: number | null }
	/** Nothing is open: plan what is next. */
	| { kind: 'plan' }
	| { kind: 'rest'; why: 'night' | 'called' };

export interface FlowState<T, D> {
	current: Current<T, D>;
	/** A question waiting for an answer, in a session on a to-do or in the plan state. */
	check: Check<D> | null;
	/** Upcoming time-bound items today, in time order. */
	next: T[];
	/** Tasks whose time ran out unanswered, most recent first. */
	missed: T[];
	/** Why this is current, one line, `null` when the user chose it or nothing needs saying. */
	reason: string | null;
	/** A session whose to-do nobody pinned yet. The first device or tick to see it writes this row. */
	pin: { key: string; todoId: number } | null;
	/** The user is here: they started the day and no check has gone unanswered since. */
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

/** When a session's check is asked, asked again and turns into away, all epoch ms, `null` when it never is. */
export interface SessionTiming {
	/** Where the session ends: its length, the next time-bound item or the end of My day, whichever is first. */
	end: number;
	dueAt: number | null;
	askAgainAt: number | null;
	awayAt: number | null;
	/** Asked early because an item is coming, asked once. */
	early: boolean;
}

/**
 * The check of a session that started at `anchor`. `cut` is where a time-bound item takes the minutes (the anchor
 * itself when one is running already, `Infinity` when none is coming). Nobody is asked, and nobody becomes away,
 * once the item's get-ready minutes begin: a person in a meeting or at lunch is not asked whether they are there.
 */
export function sessionTiming(
	anchor: number,
	lengthMs: number,
	cut: number,
	dayEnd: number
): SessionTiming {
	const natural = anchor + lengthMs;
	const end = Math.min(natural, cut, dayEnd);
	const none = { end, dueAt: null, askAgainAt: null, awayAt: null, early: false };
	if (cut <= anchor) return none;

	const readyAt = cut - READY_MINUTES * MINUTE_MS;
	const earlyAt = cut - EARLY_CHECK_MINUTES * MINUTE_MS;
	if (earlyAt < natural && earlyAt - anchor >= EARLY_CHECK_GAP_MINUTES * MINUTE_MS)
		return earlyAt < dayEnd ? { ...none, dueAt: earlyAt, early: true } : none;
	if (natural >= readyAt || natural >= dayEnd) return none;

	const later = (minutes: number) =>
		natural + minutes * MINUTE_MS < readyAt ? natural + minutes * MINUTE_MS : null;
	return {
		end,
		dueAt: natural,
		askAgainAt: later(ASK_AGAIN_MINUTES),
		awayAt: later(AWAY_MINUTES),
		early: false
	};
}

/** The stretch of the day since the user last did something: where it began and how long its session runs. */
interface Stretch {
	anchor: number;
	/** A warm-up: the first session after Start, back from away, Done or a time-bound item. */
	warm: boolean;
	/** Good answers in a row up to here. */
	good: number;
	/** Keep going answers in a row up to here. */
	keeps: number;
}

interface Point {
	at: number;
	/** The user did this: they are here. Otherwise it only moves on a stretch that is running already. */
	user: boolean;
	row: FlowLogRow | null;
}

/** Decides what is current. See the file comment. */
export function flow<T extends FlowTask, D extends FlowTodo>(
	input: FlowInput<T, D>
): FlowState<T, D> {
	const { date, now, nowMs, at, tasks, todos, settings } = input;
	const dayStart = at(0);
	const dayEnd = at(1440);
	const myDayEnd = at(settings.myDayEnd);
	const inDay = (ms: number | null): ms is number => ms !== null && ms >= dayStart && ms < dayEnd;

	// A row an undo points at is as good as never written
	const undone = new Set(input.log.filter((row) => row.type === 'undo').map((row) => row.data.ref));
	const rows = input.log.filter((row) => row.type !== 'undo' && !undone.has(row.id));
	const undoRows = input.log.filter((row) => row.type === 'undo');
	const startRows = rows.filter((row) => row.type === 'start' || row.type === 'choose');
	const checkRows = rows.filter((row) => row.type === 'check');

	const doneAts = [...tasks, ...todos]
		.filter((item) => isDone(item) && inDay(item.completedAt))
		.map((item) => item.completedAt!);

	const ranking = rank(tasks, now);
	const timeBound = timeBoundState(ranking, now, settings);
	const base = { next: ranking.upcoming, missed: ranking.missed, check: null };
	const none = { reason: null, pin: null };

	// The time-bound items as the sessions see them: where they start, when they are over, when they were finished
	const items = tasks.map((task) => ({
		start: at(task.startTime),
		over:
			at(task.startTime + task.duration) + TIME_UP_WINDOWS * settings.overrunMinutes * MINUTE_MS,
		doneAt:
			task.status === TaskStatus.Completed ? (task.completedAt ?? Number.NEGATIVE_INFINITY) : null
	}));
	const finishedBy = (item: (typeof items)[number], ms: number) =>
		item.doneAt !== null && item.doneAt <= ms;
	/** An item that has begun and is not finished holds the minutes, up to the end of its time up. */
	const blockedAt = (ms: number) =>
		items.some((item) => item.start <= ms && ms < item.over && !finishedBy(item, ms));
	/** The first item that starts after `ms` and is not done before it starts. */
	const nextStart = (ms: number) =>
		Math.min(
			Number.POSITIVE_INFINITY,
			...items
				.filter((item) => item.start > ms && !finishedBy(item, item.start))
				.map((item) => item.start)
		);
	const cutOf = (anchor: number) => (blockedAt(anchor) ? anchor : nextStart(anchor));

	// The fold: the points of the day in order, each of them the start of a stretch or the end of one that went unanswered
	const points: Point[] = [
		...startRows.map((row) => ({ at: row.at, user: true, row })),
		...checkRows.map((row) => ({ at: row.at, user: true, row })),
		...doneAts.map((doneAt) => ({ at: doneAt, user: true, row: null })),
		...undoRows.map((row) => ({ at: row.at, user: false, row })),
		// A task that ran out unanswered gives the screen back when its time up is over
		...items
			.filter((item) => item.doneAt === null)
			.map((item) => ({ at: item.over, user: false, row: null }))
	]
		.filter((point) => point.at <= nowMs)
		.sort((a, b) => a.at - b.at || Number(b.user) - Number(a.user));

	const lengthOf = (stretch: Stretch) =>
		sessionMinutes({ checkMinutes: settings.checkMinutes, warm: stretch.warm, good: stretch.good });
	const timingOf = (stretch: Stretch) =>
		sessionTiming(stretch.anchor, lengthOf(stretch) * MINUTE_MS, cutOf(stretch.anchor), myDayEnd);

	let present = false as boolean;
	let stretch = null as Stretch | null;
	let awayAt = null as number | null;
	/** Every stretch of the day, to count the time of its session. `away`: nobody answered its check. */
	const stretches: { anchor: number; length: number; away: boolean }[] = [];

	/** Turns a stretch into away when its check went unanswered before `ms`. */
	const settle = (ms: number) => {
		if (!present || !stretch) return;
		const away = timingOf(stretch).awayAt;
		if (away === null || away > ms) return;
		present = false;
		awayAt = away;
		stretches[stretches.length - 1].away = true;
	};
	const begin = (next: Stretch) => {
		stretch = next;
		stretches.push({ anchor: next.anchor, length: lengthOf(next), away: false });
	};

	for (const point of points) {
		settle(point.at);
		if (!point.user) {
			if (present) begin({ anchor: point.at, warm: true, good: 0, keeps: 0 });
			continue;
		}
		const before: Stretch | null = present ? stretch : null;
		const data = point.row?.type === 'check' ? (point.row.data as Partial<CheckData>) : null;
		present = true;
		awayAt = null;
		begin(
			data
				? {
						anchor: point.at,
						warm: data.pace === 'unfocused' || data.worked === true,
						good: isGoodAnswer(data) && data.worked !== true ? (before?.good ?? 0) + 1 : 0,
						keeps: data.keep === true ? (before?.keeps ?? 0) + 1 : 0
					}
				: { anchor: point.at, warm: true, good: 0, keeps: 0 }
		);
	}
	settle(nowMs);

	const rest = { ...base, ...none };
	// A task at a time has the screen whether anyone is here or not, the world does not wait
	if (timeBound?.kind === 'active' || timeBound?.kind === 'wrapping-up')
		return {
			...rest,
			present,
			current: {
				kind: 'task',
				task: timeBound.task,
				left: timeBound.left,
				wrapping: timeBound.kind === 'wrapping-up'
			}
		};
	if (timeBound?.kind === 'time-up')
		return {
			...rest,
			present,
			current: {
				kind: 'time-up',
				ended: timeBound.ended,
				over: timeBound.over,
				current: timeBound.current
			}
		};

	if (now < settings.myDayStart || now >= settings.myDayEnd)
		return { ...rest, present, current: { kind: 'rest', why: 'night' } };

	const lastRest = rows.findLast((row) => row.type === 'rest');
	const lastChoice = rows.findLast((row) => row.type === 'start' || row.type === 'choose');
	if (lastRest && (!lastChoice || lastChoice.at < lastRest.at))
		return { ...rest, present, current: { kind: 'rest', why: 'called' } };

	// Sessions so far today: what was pinned or chosen
	const sessionRows = rows
		.flatMap((row) => {
			const rowStart =
				row.type === 'choose' ? row.at : row.type === 'pin' ? pinStart(row.key) : null;
			return rowStart === null || row.todoId === null
				? []
				: [{ start: rowStart, todoId: row.todoId, at: row.at }];
		})
		.sort((a, b) => a.start - b.start || a.at - b.at);

	const open = (id: number | null) =>
		todos.find((todo) => todo.id === id && todo.status === 'open');

	/** The first pin of a session that still points at an open to-do, and the attempt number a new pin would take. */
	function pinnedFor(sessionStart: number) {
		let attempt = 0;
		while (rows.some((row) => row.key === pinKey(sessionStart, attempt))) {
			const row = rows.find((candidate) => candidate.key === pinKey(sessionStart, attempt))!;
			const pinned = open(row.todoId);
			if (pinned) return { todo: pinned as D, attempt };
			attempt++;
		}
		return { todo: null, attempt };
	}
	/** The to-do a session is on: the one the user chose at its start, else the pinned one. */
	const todoOf = (sessionStart: number): D | null => {
		const choice = rows.find((row) => row.type === 'choose' && row.at === sessionStart);
		return (open(choice?.todoId ?? null) as D | undefined) ?? pinnedFor(sessionStart).todo;
	};

	if (!present || !stretch) {
		const from = stretch ? stretch.anchor : null;
		return {
			...rest,
			present: false,
			current: {
				kind: 'away',
				since:
					stretch === null || awayAt === null
						? null
						: now - Math.round((nowMs - awayAt) / MINUTE_MS),
				todo: from === null ? null : todoOf(from),
				from
			}
		};
	}

	const upcoming = ranking.upcoming[0];
	if (upcoming && upcoming.startTime - now < READY_MINUTES)
		return { ...rest, present, current: { kind: 'ready', next: upcoming } };

	// The session of the stretch, and what time it is for its check
	const running: Stretch = stretch;
	const timing = timingOf(running);
	const length = lengthOf(running);
	const start = running.anchor;
	const session: Session = { start, end: timing.end, length };

	// The minutes each to-do has had today: from its pin to the next point, never more than its length plus the grace
	const lengths = new Map(stretches.map((entry) => [entry.anchor, entry]));
	const cuts = [
		...doneAts,
		...rows.filter((row) => row.type === 'rest').map((row) => row.at),
		...items.filter((item) => !finishedBy(item, item.start)).map((item) => item.start),
		...stretches.map((entry) => entry.anchor),
		myDayEnd,
		nowMs
	];
	const spent = new Map<number, number>();
	sessionRows.forEach((entry, index) => {
		const known = lengths.get(entry.start);
		// A session nobody answered counts when the user says they were working on it
		if (known?.away) return;
		const end = Math.min(
			entry.start + ((known?.length ?? length) + ANSWER_GRACE_MINUTES) * MINUTE_MS,
			sessionRows.find((other, later) => later > index && other.start > entry.start)?.start ??
				Infinity,
			...cuts.filter((cut) => cut > entry.start)
		);
		if (end > entry.start)
			spent.set(
				entry.todoId,
				(spent.get(entry.todoId) ?? 0) + Math.round((end - entry.start) / MINUTE_MS)
			);
	});
	for (const row of checkRows)
		if (row.todoId !== null && row.data.worked === true && typeof row.data.minutes === 'number')
			spent.set(row.todoId, (spent.get(row.todoId) ?? 0) + row.data.minutes);

	/** The question, once its time came. */
	const checkFor = (todo: D | null): Check<D> | null => {
		if (timing.dueAt === null || nowMs < timing.dueAt) return null;
		return {
			todo,
			level: timing.askAgainAt !== null && nowMs >= timing.askAgainAt ? 1 : 0,
			dueAt: timing.dueAt,
			sessionStart: start,
			sessionLength: length,
			keeps: running.keeps,
			early: timing.early,
			sizeAsked:
				todo !== null &&
				checkRows.some((row) => row.todoId === todo.id && row.data.size !== undefined)
		};
	};

	// Chosen by the user at this very moment ("Do this now")
	const choice = rows.find((row) => row.type === 'choose' && row.at === start);
	const chosen = open(choice?.todoId ?? null);
	if (choice && chosen)
		return {
			...rest,
			present,
			check: checkFor(chosen as D),
			current: { kind: 'todo', todo: chosen as D, session }
		};

	// Pinned: the first pin of this session that still points at an open to-do wins
	const pinned = pinnedFor(start);
	if (pinned.todo) {
		const decided = pickFor(start);
		return {
			...rest,
			present,
			reason: decided && decided.todo.id === pinned.todo.id ? decided.line : null,
			check: checkFor(pinned.todo),
			current: { kind: 'todo', todo: pinned.todo, session }
		};
	}

	const decided = pickFor(start);
	if (!decided) return { ...rest, present, check: checkFor(null), current: { kind: 'plan' } };
	return {
		...rest,
		present,
		reason: decided.line,
		check: checkFor(decided.todo as D),
		pin: { key: pinKey(start, pinned.attempt), todoId: decided.todo.id },
		current: { kind: 'todo', todo: decided.todo as D, session }
	};

	/** The pick for the session starting at `sessionStart`, continuing with the to-do of the session before. */
	function pickFor(sessionStart: number) {
		const before = sessionRows.findLast((entry) => entry.start < sessionStart);
		return pick({
			todos,
			date,
			now,
			myDayEnd: settings.myDayEnd,
			spent,
			previousId: before?.todoId ?? null,
			freeLeft: freeBetween(tasks, now, settings.myDayEnd),
			freeUntil: (minute) => freeBetween(tasks, now, minute)
		});
	}
}

/** What the hero shows for the flow state. A session counts down to its planned end in epoch ms. */
export function heroFromFlow<T extends FlowTask, D>(
	state: FlowState<T, D>,
	now: number,
	nowMs: number
): HeroState<T, D> {
	const { current } = state;
	const next = state.next[0] ?? null;
	switch (current.kind) {
		case 'task':
			return current.wrapping
				? { kind: 'wrapping-up', task: current.task, left: current.left, next }
				: { kind: 'active', task: current.task, left: current.left };
		case 'time-up':
			return {
				kind: 'time-up',
				ended: current.ended,
				over: current.over,
				current: current.current,
				next
			};
		case 'todo': {
			const { session } = current;
			return {
				kind: 'todo',
				todo: current.todo,
				left: Math.max(0, Math.ceil((session.end - nowMs) / MINUTE_MS)),
				length: Math.max(1, Math.round((session.end - session.start) / MINUTE_MS)),
				line: state.reason,
				next,
				check: state.check
			};
		}
		case 'ready':
			return { kind: 'ready', next: current.next, left: current.next.startTime - now };
		case 'away':
			return {
				kind: 'away',
				since: current.since,
				todo: current.todo,
				minutes: current.from === null ? 0 : workedMinutes(current.from, nowMs)
			};
		case 'plan':
			return { kind: 'plan', check: state.check };
		default:
			return current;
	}
}

/** The title of what is current, `null` for a state that is not an item (plan, ready, away, rest). */
export function currentTitle(
	current: Current<{ title: string }, { title: string }>
): string | null {
	switch (current.kind) {
		case 'task':
			return current.task.title;
		case 'time-up':
			return (current.current ?? current.ended).title;
		case 'todo':
			return current.todo.title;
		default:
			return null;
	}
}

/** One line for the log: why the screen changed to this. */
export function switchLine(state: Pick<FlowState<unknown, unknown>, 'current' | 'reason'>): string {
	const { current } = state;
	switch (current.kind) {
		case 'task':
			return 'Scheduled for now';
		case 'time-up':
			return 'Time ran out for the previous task';
		case 'todo':
			return state.reason ?? 'The next session started';
		case 'ready':
			return 'The next item is about to start';
		case 'away':
			return current.since === null ? 'The day has not started yet' : 'Nobody answered the check';
		case 'plan':
			return 'Nothing is open to pick';
		case 'rest':
			return current.why === 'night' ? 'My day is over' : 'The user called it a day';
	}
}
