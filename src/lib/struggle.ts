/**
 * The struggle ladder, "Give it 5 minutes first" and Face it (`docs/flow-plan.md` 5.6, 5.14). Pure.
 *
 * A struggle is the user saying that the work is not going: "I couldn't focus" after a check, "I lost energy for
 * this", "I cannot get started" for the second time, or a third "Something else" within half an hour. The ladder says
 * what the app does about it on its own: rotate to another to-do, or give a break. The device decides at the moment of
 * the answer and writes the step to the flow log (a `rotate` or a `break` row), so what happened never changes when a
 * to-do is added later. The flow engine only replays those rows: cool downs, the low energy hour and the pending
 * "give it 5 minutes" come from here too.
 */
import { findStuckReason } from '#lib/anchoring.js';
import { isGoodAnswer, type CheckData } from '#lib/checks.js';
import type { FlowRow, Todo, TodoPatch } from '#lib/core/repo.js';

/** A to-do the user was rotated away from is left alone for this long, a break ends it early. */
export const COOL_DOWN_MINUTES = 60;
/** After a struggle that follows a break, the next hour picks short to-dos first... */
export const LOW_ENERGY_MINUTES = 60;
/** ...the ones with at most this much left. */
export const LOW_ENERGY_MAX_LEFT = 30;
/** Bailing out of a fresh to-do in its first minutes gets this many minutes of trying first. */
const TRY_FIRST_MINUTES = 5;
/** The third "Something else" within this many minutes is a struggle. */
const ELSE_WINDOW_MINUTES = 30;
const ELSE_LIMIT = 3;
/** The break after the second struggle that follows a break. */
export const LONG_BREAK_MINUTES = 20;
/** The break the check offers after this many minutes of work without one... */
export const OFFER_AFTER_MINUTES = 90;
/** ...and how long it is. */
export const OFFER_BREAK_MINUTES = 5;
/** A to-do pushed away this often, on more than one day, is faced. */
const FACE_IT_SKIPS = 3;
/** The session a to-do is faced in, nothing to switch to. */
export const FACE_IT_MINUTES = 10;

const MINUTE_MS = 60_000;
const HOLD_MS = TRY_FIRST_MINUTES * MINUTE_MS;

export type Struggle = 'unfocused' | 'low-energy' | 'cant-start' | 'else';

/** The part of a flow log row the rules read. */
export type StruggleRow = Pick<FlowRow, 'id' | 'at' | 'type' | 'todoId' | 'data'>;

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** The minute a rotate or break row takes effect: when it was written, or later when it is held for the 5 minutes. */
export const takesEffectAt = (row: Pick<StruggleRow, 'at' | 'data'>): number =>
	row.at + Math.max(0, Math.min(HOLD_MS, num(row.data.after)));

/** What puts the user in front of the screen again: anything they answered or finished. Held steps wait for none of it. */
const USER_TYPES = new Set(['start', 'choose', 'check', 'back', 'rest', 'rotate', 'break', 'face']);

/** A rotation or break that is in force, with the minute it took (or takes) effect. */
export interface Step<R extends StruggleRow = StruggleRow> {
	row: R;
	at: number;
}

/**
 * The rotate and break rows that count: a row held for 5 minutes is dropped when the user did anything else before
 * it took effect (they answered, finished something, chose). `rows` come without the rows an undo pointed at.
 */
export function stepsOf<R extends StruggleRow>(
	rows: readonly R[],
	doneAts: readonly number[] = []
): Step<R>[] {
	const touches = [
		...rows.filter((row) => USER_TYPES.has(row.type)).map((row) => ({ at: row.at, id: row.id })),
		...doneAts.map((at) => ({ at, id: Number.NaN }))
	];
	return rows
		.filter((row) => row.type === 'rotate' || row.type === 'break')
		.map((row) => ({ row, at: takesEffectAt(row) }))
		.filter(
			({ row, at }) =>
				at === row.at ||
				!touches.some((touch) => touch.id !== row.id && touch.at > row.at && touch.at < at)
		)
		.sort((a, b) => a.at - b.at || a.row.id - b.row.id);
}

/** The to-dos that are cooling down at `ms`: rotated away from within the hour and no break since. */
export function coolingAt(steps: readonly Step[], ms: number): Set<number> {
	const cooling = new Set<number>();
	for (const { row, at } of steps) {
		if (row.type !== 'rotate' || row.todoId === null || at > ms) continue;
		if (ms >= at + COOL_DOWN_MINUTES * MINUTE_MS) continue;
		if (steps.some((other) => other.row.type === 'break' && other.at > at && other.at <= ms))
			continue;
		cooling.add(row.todoId);
	}
	return cooling;
}

/** True within the hour after a rotation that came after a break: short to-dos first. */
export function lowEnergyAt(steps: readonly Step[], ms: number): boolean {
	return steps.some(
		({ row, at }) =>
			row.type === 'rotate' &&
			row.data.low === true &&
			at <= ms &&
			ms < at + LOW_ENERGY_MINUTES * MINUTE_MS
	);
}

/** A step that was asked for and waits for its 5 minutes, `until` is when it happens. */
export function heldStep<R extends StruggleRow>(
	steps: readonly Step<R>[],
	nowMs: number
): { step: Step<R>; until: number } | null {
	const held = steps.findLast(({ row, at }) => at > row.at && row.at <= nowMs && nowMs < at);
	return held ? { step: held, until: held.at } : null;
}

export type LadderEvent =
	| { kind: 'reset'; at: number }
	| { kind: 'good'; at: number }
	| { kind: 'break'; at: number }
	| { kind: 'struggle'; at: number; todoId: number | null; why: Struggle };

/**
 * What the day so far says about how the work goes, in time order. `rows` come without undone rows, `doneAts` are
 * the times something was finished. The first "I cannot get started" on a to-do is not a struggle yet, the second is.
 */
export function ladderEvents(
	rows: readonly StruggleRow[],
	doneAts: readonly number[] = []
): LadderEvent[] {
	const events: LadderEvent[] = doneAts.map((at) => ({ kind: 'good', at }));
	const cantStart = new Set<number>();
	const elses: number[] = [];
	for (const row of rows) {
		const { at } = row;
		const data = row.data as Partial<CheckData> & { reason?: unknown; why?: unknown };
		if (row.type === 'start') events.push({ kind: 'reset', at });
		else if (row.type === 'break') events.push({ kind: 'break', at: takesEffectAt(row) });
		else if (row.type === 'check') {
			if (data.worked === true) events.push({ kind: 'reset', at });
			else if (data.pace === 'unfocused')
				events.push({ kind: 'struggle', at, todoId: row.todoId, why: 'unfocused' });
			else if (isGoodAnswer(data as CheckData)) events.push({ kind: 'good', at });
		} else if (row.type === 'stuck') {
			if (data.reason === 'low-energy')
				events.push({ kind: 'struggle', at, todoId: row.todoId, why: 'low-energy' });
			else if (data.reason === 'cant-start' && row.todoId !== null) {
				if (cantStart.has(row.todoId))
					events.push({ kind: 'struggle', at, todoId: row.todoId, why: 'cant-start' });
				cantStart.add(row.todoId);
			}
		} else if (row.type === 'rotate' && data.why === 'else') {
			elses.push(at);
			const recent = elses.filter((time) => at - time < ELSE_WINDOW_MINUTES * MINUTE_MS);
			if (recent.length >= ELSE_LIMIT)
				events.push({ kind: 'struggle', at, todoId: row.todoId, why: 'else' });
		}
	}
	return events.sort((a, b) => a.at - b.at);
}

export interface Ladder {
	/** Struggles since presence began, the last break or the last good answer. */
	struggles: number;
	/** A break happened since presence began: the low energy column of the ladder applies. */
	afterBreak: boolean;
}

export function ladderOf(events: readonly LadderEvent[]): Ladder {
	let ladder: Ladder = { struggles: 0, afterBreak: false };
	for (const event of events) {
		if (event.kind === 'reset') ladder = { struggles: 0, afterBreak: false };
		else if (event.kind === 'good') ladder = { ...ladder, struggles: 0 };
		else if (event.kind === 'break') ladder = { struggles: 0, afterBreak: true };
		else ladder = { ...ladder, struggles: ladder.struggles + 1 };
	}
	return ladder;
}

/** What the app does about a struggle. */
export type StepPlan =
	| { step: 'rotate'; low: boolean; hold: boolean }
	| { step: 'break'; minutes: number; last: boolean; hold: false };

export interface PlanInput {
	rows: readonly StruggleRow[];
	doneAts?: readonly number[];
	trigger: Struggle;
	/** The to-do the user struggled with. */
	todoId: number;
	nowMs: number;
	/** When the session on that to-do started. */
	sessionStart: number;
	/** Other to-dos a rotation could go to: open, ready and not cooling down. */
	others: number;
	/** The usual break, from the settings. */
	breakMinutes: number;
}

/**
 * The step for a struggle that just happened, `null` when it does not count (the first "I cannot get started" on a
 * to-do, the first and second "Something else" are only a tap and rotate on their own, see `elsePlan`).
 * `rows` are the log before the trigger was written.
 */
export function planStep(input: PlanInput): StepPlan | null {
	const { rows, trigger, todoId, nowMs } = input;
	const events = ladderEvents(rows, input.doneAts);
	const before = ladderOf(events);

	let counts = true;
	if (trigger === 'cant-start')
		counts = rows.some(
			(row) => row.type === 'stuck' && row.todoId === todoId && row.data.reason === 'cant-start'
		);
	if (trigger === 'else') {
		const recent = rows.filter(
			(row) =>
				row.type === 'rotate' &&
				row.data.why === 'else' &&
				nowMs - row.at < ELSE_WINDOW_MINUTES * MINUTE_MS
		);
		counts = recent.length + 1 >= ELSE_LIMIT;
	}
	if (!counts) return null;

	const struggles = before.struggles + 1;
	const { afterBreak } = before;
	const breakStep = (minutes: number, last: boolean): StepPlan => ({
		step: 'break',
		minutes,
		last,
		hold: false
	});

	// With nothing to rotate to, the rotation is the break
	if (afterBreak) {
		if (struggles >= 2) return breakStep(LONG_BREAK_MINUTES, true);
		return input.others === 0
			? breakStep(input.breakMinutes, false)
			: { step: 'rotate', low: true, hold: canHold(input, events) };
	}
	if (struggles >= 3 || input.others === 0) return breakStep(input.breakMinutes, false);
	return { step: 'rotate', low: false, hold: canHold(input, events) };
}

/** "Something else" is the user's own wish: it rotates at once, it is a struggle only the third time. */
export function elsePlan(input: Omit<PlanInput, 'trigger'>): StepPlan {
	const full: PlanInput = { ...input, trigger: 'else' };
	const planned = planStep(full);
	if (planned) return planned;
	// With no other to-do to go to, the rotation is a break as well
	if (input.others === 0)
		return { step: 'break', minutes: input.breakMinutes, last: false, hold: false };
	return {
		step: 'rotate',
		low: false,
		hold: canHold(full, ladderEvents(input.rows, input.doneAts))
	};
}

/**
 * "Give it 5 minutes first": a to-do that did not struggle today, left in its first minutes, for "Something else" or
 * "I lost energy for this". The wall in front of starting looks like lost energy. "I need a break" is never held.
 */
function canHold(input: PlanInput, events: readonly LadderEvent[]): boolean {
	if (input.trigger !== 'else' && input.trigger !== 'low-energy') return false;
	if (input.nowMs - input.sessionStart >= HOLD_MS) return false;
	const struggled = events.some(
		(event) => event.kind === 'struggle' && event.todoId === input.todoId
	);
	const rotated = input.rows.some((row) => row.type === 'rotate' && row.todoId === input.todoId);
	return !struggled && !rotated;
}

export const STRUGGLES: readonly Struggle[] = ['unfocused', 'low-energy', 'cant-start', 'else'];
const SLUG = /^[a-z][a-z-]{0,23}$/;
const BREAK_LIMITS = { min: 1, max: 60 } as const;

/**
 * What the rows of a rotation, a break, a stuck tap, a face it answer and an "I'm back" may carry. One validator for
 * the `/flow` route and the guest's backend: unknown keys are dropped, nothing a screen could not have sent is kept.
 */
export function parseStepData(
	type: 'rotate' | 'break' | 'stuck' | 'face' | 'back',
	raw: Record<string, unknown>
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
	const fail = (error: string) => ({ ok: false as const, error });
	const value: Record<string, unknown> = {};

	if (type === 'rotate') {
		if (!STRUGGLES.includes(raw.why as Struggle)) return fail('why is the struggle behind it');
		value.why = raw.why;
		if (raw.low !== undefined) {
			if (raw.low !== true) return fail('low is true when set');
			value.low = true;
		}
		if (raw.after !== undefined) {
			if (raw.after !== HOLD_MS) return fail('a rotation is held for 5 minutes or not at all');
			value.after = HOLD_MS;
		}
	} else if (type === 'break') {
		const { minutes } = raw;
		if (
			typeof minutes !== 'number' ||
			!Number.isInteger(minutes) ||
			minutes < BREAK_LIMITS.min ||
			minutes > BREAK_LIMITS.max
		)
			return fail(`minutes must be ${BREAK_LIMITS.min} to ${BREAK_LIMITS.max}`);
		value.minutes = minutes;
		for (const key of ['activity', 'why'] as const) {
			if (raw[key] === undefined) continue;
			if (typeof raw[key] !== 'string' || !SLUG.test(raw[key]))
				return fail(`${key} is a short word`);
			value[key] = raw[key];
		}
		if (raw.last !== undefined) {
			if (raw.last !== true) return fail('last is true when set');
			value.last = true;
		}
	} else if (type === 'stuck') {
		if (!findStuckReason(raw.reason)) return fail('reason is one of the stuck reasons');
		value.reason = raw.reason;
	} else if (type === 'face') {
		if (!isFaceAnswer(raw.answer)) return fail('answer is one of the face it answers');
		value.answer = raw.answer;
	}
	return { ok: true, value };
}

/** What a rotate or break row is written with, the one place that knows the data keys. */
export function stepData(plan: StepPlan, trigger: Struggle): Record<string, unknown> {
	if (plan.step === 'rotate')
		return {
			why: trigger,
			...(plan.low ? { low: true } : {}),
			...(plan.hold ? { after: HOLD_MS } : {})
		};
	return { why: trigger, minutes: plan.minutes, ...(plan.last ? { last: true } : {}) };
}

/** An answer for the flow log, what `recordAnswer` takes. */
export interface StepAnswer {
	type: 'rotate' | 'break';
	todoId: number | null;
	data: Record<string, unknown>;
}

/**
 * What the app does about a struggle, as the row to write. `null` when the struggle does not count yet (the first "I
 * cannot get started" on a to-do). `activity` is the break's activity, chosen by the caller (`breaks.ts`).
 */
export function stepFor(
	input: PlanInput & { activity: string }
): { plan: StepPlan; answer: StepAnswer } | null {
	const plan = input.trigger === 'else' ? elsePlan(input) : planStep(input);
	if (!plan) return null;
	const data = stepData(plan, input.trigger);
	return {
		plan,
		answer:
			plan.step === 'rotate'
				? { type: 'rotate', todoId: input.todoId, data }
				: { type: 'break', todoId: null, data: { ...data, activity: input.activity } }
	};
}

/** The rows an undo did not point at, and without the undo rows themselves. */
export function liveRows<R extends Pick<StruggleRow, 'id' | 'type' | 'data'>>(
	rows: readonly R[]
): R[] {
	const undone = new Set(rows.filter((row) => row.type === 'undo').map((row) => row.data.ref));
	return rows.filter((row) => row.type !== 'undo' && !undone.has(row.id));
}

/** True while the 5 minutes of a held rotation run, the first 5 minutes of a session count as the first. */
export const isFreshSession = (sessionStart: number, nowMs: number): boolean =>
	nowMs - sessionStart < HOLD_MS;

/** The to-do's skips after it was pushed away: one more, and the day the run began. */
export function skipPatch(todo: Pick<Todo, 'skips' | 'skipSince'>, today: string): TodoPatch {
	return { skips: todo.skips + 1, skipSince: todo.skips === 0 ? today : todo.skipSince };
}

/** Undo of a rotation: one skip less, and no day to count from when none is left. */
export function unskipPatch(todo: Pick<Todo, 'skips' | 'skipSince'>): TodoPatch {
	return {
		skips: Math.max(0, todo.skips - 1),
		skipSince: todo.skips <= 1 ? null : todo.skipSince
	};
}

/** Pushed away often enough, on more than one day, that the next time it is picked it is faced. */
export function needsFaceIt(
	todo: Partial<Pick<Todo, 'skips' | 'skipSince'>>,
	today: string
): boolean {
	return (
		(todo.skips ?? 0) >= FACE_IT_SKIPS &&
		typeof todo.skipSince === 'string' &&
		todo.skipSince < today
	);
}

export const faceLine = (title: string, skips: number): string =>
	`${title} was pushed away ${skips} times. ${FACE_IT_MINUTES} minutes now, then you decide.`;

/** The question at the end of a Face it session. */
export const FACE_ANSWERS = [
	{ answer: 'smaller', label: 'A smaller first step' },
	{ answer: 'fine', label: "It's fine now, keep going" },
	{ answer: 'move', label: 'Move its due date' },
	{ answer: 'drop', label: 'Drop it' }
] as const;
export type FaceAnswer = (typeof FACE_ANSWERS)[number]['answer'];

export const isFaceAnswer = (value: unknown): value is FaceAnswer =>
	FACE_ANSWERS.some((entry) => entry.answer === value);
