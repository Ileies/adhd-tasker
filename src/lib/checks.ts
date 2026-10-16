/**
 * The check: the question at the end of a session, "How far is Study B?" (`docs/flow-plan.md` 5.2, 5.4, 5.5).
 * Pure rules for how long a session runs, which answers are offered, whether progress was slow, what is asked
 * next and what an answer does to the to-do. The flow engine decides when a check is due, the hero shows it,
 * `core/flow.ts` applies the answer, and all three use the functions here.
 */
import type { Todo, TodoPatch } from '#lib/core/repo.js';
import { ESTIMATE_LIMITS } from '#lib/todo-input.js';

/** The first session after Start, I'm back, a Done or a time-bound item is this long, or the check interval when that is shorter. */
export const WARMUP_MINUTES = 15;
/** After two good answers in a row the next session is this much longer... */
export const LONG_FACTOR = 1.5;
/** ...but never longer than this. */
export const MAX_SESSION_MINUTES = 60;
/** A session is counted up to its length plus this many minutes, while its check waits for an answer. */
export const ANSWER_GRACE_MINUTES = 5;
/** Time away from the screen counts after "I was working on it", but at most this much. */
export const MAX_WORKED_MINUTES = 120;
/** Keep going is offered at most this many times in a row, then the number is due. */
export const KEEP_GOING_MAX = 2;
/** A gain below this share of the expected one is slow. */
export const SLOW_SHARE = 0.5;
/** A check never offers more than this: a to-do is finished with Done, never by a guess. */
export const MAX_GUESS = 95;

/** What the user said when the pace was slow, see `PACE_CHOICES`. */
export type Pace = 'bigger' | 'unfocused' | 'hard';
export const PACES: readonly Pace[] = ['bigger', 'unfocused', 'hard'];

export const PACE_CHOICES: readonly { pace: Pace; label: string }[] = [
	{ pace: 'bigger', label: "It's bigger than I thought" },
	{ pace: 'unfocused', label: "I couldn't focus" },
	{ pace: 'hard', label: 'A hard part, keep going' }
];

/** The row data of an answered check, what `/flow` takes and the engine replays. */
export interface CheckData {
	/** The progress when the check was asked. */
	before: number;
	/** The progress answered. Equal to `before` for Keep going. */
	after: number;
	/** Minutes spent on the to-do in the session that ended. */
	minutes: number;
	/** Keep going: no number, not judged. */
	keep?: boolean;
	/** The answer to the pace question, when it was asked. */
	pace?: Pace;
	/** The answer to "How big is all of it?": minutes, or `null` for Not sure. */
	size?: number | null;
	/** The check after Away: "I was working on it". */
	worked?: boolean;
	/** The gain was slow for the size, written by whoever records the answer. */
	slow?: boolean;
	/** The 5 minute break was offered with this question (so it is not offered again for a while). */
	offered?: boolean;
}

/**
 * What a question is about: how far the to-do is (`progress`), whether to go on after a break (`break`), or, after
 * the last break the ladder gives, whether the day's focus work is done (`day`), or what to do with a to-do that
 * was pushed away again and again (`face`, the end of its ten minutes).
 */
export type CheckAbout = 'progress' | 'break' | 'day' | 'face';

/** A question waiting for an answer, as the flow engine hands it to the hero. */
export interface Check<D> {
	about: CheckAbout;
	/** The to-do the question is about. `null` in the plan state: nothing to ask, only "still there?". */
	todo: D | null;
	/** 0: asked. 1: asked again after two minutes ("Still there?"). */
	level: 0 | 1;
	/** Epoch ms the question was first asked. */
	dueAt: number;
	/** Epoch ms the session this check closes started, and the minutes it was meant to run. */
	sessionStart: number;
	sessionLength: number;
	/** Keep going answers in a row so far. */
	keeps: number;
	/** Asked early: a time-bound item is about to start. Asked once. */
	early: boolean;
	/** "How big is all of it?" was asked for this to-do already, Not sure included. */
	sizeAsked: boolean;
	/** The 5 minute break chip comes with this question: 90 minutes of work without a break, offered once. */
	offerBreak: boolean;
}

export const isPace = (value: unknown): value is Pace => PACES.includes(value as Pace);

const round5 = (value: number) => Math.round(value / 5) * 5;

/** How long the next session runs. `good` is the number of good answers in a row before it. */
export function sessionMinutes(input: {
	checkMinutes: number;
	warm: boolean;
	good: number;
}): number {
	const { checkMinutes, warm, good } = input;
	if (warm) return Math.min(WARMUP_MINUTES, checkMinutes);
	if (good >= 2) return Math.min(MAX_SESSION_MINUTES, Math.round(checkMinutes * LONG_FACTOR));
	return checkMinutes;
}

/** Minutes a session counts: from its start to the answer, at most its length plus the grace. */
export function sessionSpent(startMs: number, endMs: number, lengthMinutes: number): number {
	const elapsed = Math.round((endMs - startMs) / 60_000);
	return Math.max(0, Math.min(elapsed, lengthMinutes + ANSWER_GRACE_MINUTES));
}

/** Minutes of a session that ended unanswered, counted when the user says they were working on it. */
export function workedMinutes(startMs: number, backMs: number): number {
	return Math.max(0, Math.min(MAX_WORKED_MINUTES, Math.round((backMs - startMs) / 60_000)));
}

/** The gain in percent a session of `minutes` is expected to bring, `null` when the size is not known. */
export function expectedGain(minutes: number, size: number | null): number | null {
	return size === null || size <= 0 ? null : (minutes / size) * 100;
}

/** The progress values offered above the current one: around the expected gain, 5 % steps, duplicates merged. */
export function stepTargets(progress: number, minutes: number, size: number | null): number[] {
	const expected = expectedGain(minutes, size);
	const gains =
		expected === null
			? [5, 10, 20]
			: [0.5, 1, 2].map((factor) => Math.max(5, round5(expected * factor)));
	const targets = gains
		.map((gain) => Math.min(MAX_GUESS, progress + gain))
		.filter((to) => to > progress);
	return [...new Set(targets)].sort((a, b) => a - b);
}

export type CheckChip =
	| { kind: 'keep' }
	| { kind: 'same'; progress: number }
	| { kind: 'step'; progress: number };

/** The answers as chips, in order. Done and Other (a slider) sit beside them. */
export function checkChips(input: {
	progress: number;
	minutes: number;
	size: number | null;
	/** Keep going answers in a row so far. */
	keeps: number;
}): CheckChip[] {
	const { progress, minutes, size, keeps } = input;
	return [
		...(keeps < KEEP_GOING_MAX ? [{ kind: 'keep' } as const] : []),
		{ kind: 'same', progress },
		...stepTargets(progress, minutes, size).map((to) => ({ kind: 'step', progress: to }) as const)
	];
}

/** The words on a chip: "Keep going", "No change" or the progress it sets. */
export function chipLabel(chip: CheckChip): string {
	if (chip.kind === 'keep') return 'Keep going';
	if (chip.kind === 'same') return 'No change';
	return `${chip.progress} %`;
}

/** Slower than half of what a session of this length should bring. Unknown size: never slow, nothing to compare. */
export function isSlow(input: {
	before: number;
	after: number;
	minutes: number;
	size: number | null;
}): boolean {
	const expected = expectedGain(input.minutes, input.size);
	return (
		expected !== null && input.minutes > 0 && input.after - input.before < expected * SLOW_SHARE
	);
}

/** What is asked after a number: the size of a to-do that has none, or the reason for a slow pace. */
export type FollowUp = 'size' | 'pace' | null;

export function followUp(input: {
	before: number;
	after: number;
	minutes: number;
	size: number | null;
	/** "How big is all of it?" was asked for this to-do already, Not sure included. */
	sizeAsked: boolean;
}): FollowUp {
	if (input.after >= 100) return null;
	if (input.size === null) return input.sizeAsked ? null : 'size';
	return isSlow(input) ? 'pace' : null;
}

/** Time spent divided by progress, rounded to 5 minutes. `null` before there is anything to divide. */
export function learnedSize(spentMinutes: number, progress: number): number | null {
	if (spentMinutes <= 0 || progress <= 0) return null;
	const size = Math.max(5, round5((spentMinutes * 100) / progress));
	return Math.min(ESTIMATE_LIMITS.max, size);
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * What a check answer may carry. One validator for the `/flow` route and the guest's backend. `slow` is never taken
 * from the outside: whoever records the answer works it out from the to-do's size.
 */
export function parseCheckData(
	value: unknown
): { ok: true; value: CheckData } | { ok: false; error: string } {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		return { ok: false, error: 'a check needs its answer' };
	const input = value as Record<string, unknown>;
	const fail = (error: string) => ({ ok: false as const, error });

	if (!isWhole(input.before, 0, 100)) return fail('before must be a progress from 0 to 100');
	if (!isWhole(input.after, 0, 100)) return fail('after must be a progress from 0 to 100');
	if (!isWhole(input.minutes, 0, MAX_WORKED_MINUTES))
		return fail(`minutes must be 0 to ${MAX_WORKED_MINUTES}`);
	const data: CheckData = { before: input.before, after: input.after, minutes: input.minutes };

	if (input.keep !== undefined) {
		if (input.keep !== true) return fail('keep is true when set');
		if (data.after !== data.before) return fail('keep going has no new progress');
		data.keep = true;
	}
	if (input.pace !== undefined) {
		if (!isPace(input.pace)) return fail('pace must be bigger, unfocused or hard');
		data.pace = input.pace;
	}
	if (input.size !== undefined) {
		if (input.size !== null && !isWhole(input.size, ESTIMATE_LIMITS.min, ESTIMATE_LIMITS.max))
			return fail('size must be whole minutes or null');
		data.size = input.size;
	}
	if (input.worked !== undefined) {
		if (input.worked !== true) return fail('worked is true when set');
		data.worked = true;
	}
	if (input.offered !== undefined) {
		if (input.offered !== true) return fail('offered is true when set');
		data.offered = true;
	}
	return { ok: true, value: data };
}

/** A good answer keeps the flow: Keep going, or a gain that is not slow. A struggle or a slow gain is not. */
export const isGoodAnswer = (data: Pick<CheckData, 'keep' | 'slow' | 'pace'>): boolean =>
	data.keep === true || (data.slow !== true && data.pace !== 'unfocused');

/** What an answer does to the to-do: the progress, the time spent and the size (typed by the user, or learned from the pace). */
export function checkPatch(
	todo: Pick<Todo, 'estimate' | 'spentMinutes'>,
	data: CheckData
): TodoPatch {
	const spentMinutes = todo.spentMinutes + data.minutes;
	const patch: TodoPatch = { spentMinutes };
	if (!data.keep) patch.progress = data.after;
	// Moving forward ends what pushing it away counted
	if (!data.keep && data.after > data.before) {
		patch.skips = 0;
		patch.skipSince = null;
	}
	if (typeof data.size === 'number') {
		patch.estimate = data.size;
		patch.learned = false;
	} else if (data.pace === 'bigger') {
		const learned = learnedSize(spentMinutes, data.after);
		// "Bigger than I thought" never makes it smaller
		if (learned !== null && learned > (todo.estimate ?? 0)) {
			patch.estimate = learned;
			patch.learned = true;
		}
	}
	return patch;
}
