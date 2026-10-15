import type { RankTask } from '#lib/priority.js';

/** A short alarm that goes with a hint, so the app holds the timer instead of the user. */
export interface StuckAction {
	label: string;
	minutes: number;
	/** What the alarm says when it rings. */
	alarm: string;
}

/** What the user can say when they press "I'm stuck". The hint is shown at once, so the button helps without any AI. */
export const STUCK_REASONS = [
	{
		id: 'too-big',
		label: 'It feels too big',
		hint: 'Pick the smallest piece you can finish in 5 minutes and do only that.',
		action: {
			label: 'Start a 5 min timer',
			minutes: 5,
			alarm: 'Five minutes are up. Is the small piece done?'
		}
	},
	{
		id: 'cant-start',
		label: 'I cannot get started',
		hint: 'Set a timer for 2 minutes and do the very first physical action, like opening the file.',
		action: {
			label: 'Start a 2 min timer',
			minutes: 2,
			alarm: 'Two minutes are up. Keep going or stop here.'
		}
	},
	{
		id: 'distracted',
		label: 'I got distracted',
		hint: 'That is fine. Close the other thing and write one sentence of this task.',
		action: {
			label: 'Start a 2 min timer',
			minutes: 2,
			alarm: 'Two minutes are up. How far did you get?'
		}
	},
	{
		id: 'break',
		label: 'I need a break',
		hint: 'Step away from the screen for 5 minutes, then come back to this.',
		action: {
			label: 'Start a 5 min break',
			minutes: 5,
			alarm: 'The break is over. Back to the task.'
		}
	}
] as const satisfies readonly {
	id: string;
	label: string;
	hint: string;
	action: StuckAction;
}[];

export type StuckReason = (typeof STUCK_REASONS)[number];

export const findStuckReason = (id: unknown): StuckReason | undefined =>
	STUCK_REASONS.find((reason) => reason.id === id);

/** How long after its end a task counts as a hyperfocus overrun, in minutes. Shared by the alarm and the agent event. */
export const OVERRUN_LIMITS = { min: 5, max: 120, default: 15 } as const;
/** Heads-up before the next task starts, in minutes. */
export const REMINDER_LIMITS = { min: 1, max: 60, default: 15 } as const;
/** A threshold crossed longer ago than this is history: a reload must not ring for it. */
const FRESH_MINUTES = 5;

/**
 * The task that just crossed the hyperfocus threshold, if any. `missed` is the ranking's list (most recent first), only the
 * latest ended task counts, like the `task.overrun` event. Returns null once the moment has passed.
 */
export function hyperfocusDue<T extends RankTask>(
	missed: T[],
	now: number,
	minutes: number
): T | null {
	const task = missed[0];
	if (!task) return null;
	const over = now - (task.startTime + task.duration);
	return over >= minutes && over < minutes + FRESH_MINUTES ? task : null;
}

/** The first upcoming task that starts within `advance` minutes, so the user can wrap up before it. */
export function reminderDue<T extends RankTask>(
	upcoming: T[],
	now: number,
	advance: number
): T | null {
	return upcoming.find((task) => task.startTime > now && task.startTime - now <= advance) ?? null;
}

/** Stops one moment from sounding twice. */
export const momentKey = (kind: 'overrun' | 'reminder' | 'wrap-up', date: string, task: RankTask) =>
	`${kind}:${date}:${task.id}:${task.startTime}:${task.duration}`;
