import type { RankTask, Ranking } from '#lib/priority.js';

/** The last minutes of a task are its wrap-up, at most this many... */
export const WRAP_UP_MINUTES = 10;
/** ...or this share of a long task, whichever starts earlier, but never more than half of the task. */
export const WRAP_UP_SHARE = 0.25;
/** The transition bar stays while the task that started in its place is younger than this. */
export const BAR_MINUTES = 15;
/** Time up stays on screen for this many overrun windows, unless it is answered earlier. */
export const TIME_UP_WINDOWS = 2;

export type HeroState<T extends RankTask> =
	| { kind: 'active'; task: T; left: number }
	| { kind: 'wrapping-up'; task: T; left: number; next: T | null }
	/** `ended` ran out. With a `current` the hero shows that task under a transition bar, without one it shows time up itself. */
	| { kind: 'time-up'; ended: T; over: number; current: T | null; next: T | null }
	| { kind: 'free'; next: T }
	| { kind: 'empty' };

export interface HeroSettings {
	overrunMinutes: number;
}

/** Minutes before the end of a task at which it counts as wrapping up. */
export function wrapUpWindow(duration: number): number {
	return Math.min(duration / 2, Math.max(WRAP_UP_MINUTES, duration * WRAP_UP_SHARE));
}

/**
 * What the Now hero shows. Pure and built on `rank()`, which stays as it is so the server agrees.
 * Time up needs no stored answer: Done, 15 more minutes and moving the task all take it out of `missed`.
 */
export function heroState<T extends RankTask>(
	ranking: Ranking<T>,
	now: number,
	settings: HeroSettings
): HeroState<T> {
	const { current, upcoming, missed } = ranking;
	const ended = missed[0];
	const over = ended ? now - (ended.startTime + ended.duration) : 0;
	const fresh = ended !== undefined && over < settings.overrunMinutes * TIME_UP_WINDOWS;
	const next = upcoming[0] ?? null;

	if (!current) {
		if (ended && fresh) return { kind: 'time-up', ended, over, current: null, next };
		return next ? { kind: 'free', next } : { kind: 'empty' };
	}

	if (ended && fresh && now - current.startTime < BAR_MINUTES)
		return { kind: 'time-up', ended, over, current, next };

	const left = current.startTime + current.duration - now;
	if (left <= wrapUpWindow(current.duration))
		return { kind: 'wrapping-up', task: current, left, next };
	return { kind: 'active', task: current, left };
}
