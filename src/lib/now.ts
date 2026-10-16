import { formatClock, formatMinutes } from '#lib/format.js';
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
	const timeBound = timeBoundState(ranking, now, settings);
	if (timeBound) return timeBound;
	const next = ranking.upcoming[0] ?? null;
	return next ? { kind: 'free', next } : { kind: 'empty' };
}

/** What a task at a time or an appointment makes of the hero, `null` when nothing time-bound has the screen right now. */
export function timeBoundState<T extends RankTask>(
	ranking: Ranking<T>,
	now: number,
	settings: HeroSettings
): Extract<HeroState<T>, { kind: 'active' | 'wrapping-up' | 'time-up' }> | null {
	const { current, upcoming, missed } = ranking;
	const ended = missed[0];
	const over = ended ? now - (ended.startTime + ended.duration) : 0;
	const fresh = ended !== undefined && over < settings.overrunMinutes * TIME_UP_WINDOWS;
	const next = upcoming[0] ?? null;

	if (!current) {
		return ended && fresh ? { kind: 'time-up', ended, over, current: null, next } : null;
	}

	if (ended && fresh && now - current.startTime < BAR_MINUTES)
		return { kind: 'time-up', ended, over, current, next };

	const left = current.startTime + current.duration - now;
	if (left <= wrapUpWindow(current.duration))
		return { kind: 'wrapping-up', task: current, left, next };
	return { kind: 'active', task: current, left };
}

/** The hero confirms Done for this long before it moves on to the next state. */
export const DONE_CONFIRM_MS = 1500;
/** The reason for a switch fades out after this long. */
export const REASON_MS = 60_000;

/** The task the hero's main area is about, the one Done confirms: the running task, or the one time up shows (under the transition bar the new one). */
export function heroFocus<T extends RankTask>(hero: HeroState<T>): T | null {
	if (hero.kind === 'active' || hero.kind === 'wrapping-up') return hero.task;
	if (hero.kind === 'time-up') return hero.current ?? hero.ended;
	return null;
}

/** Whether `now` (minutes since midnight) lies outside My day, the user's night. */
export function isNight(now: number, myDayStart: number, myDayEnd: number): boolean {
	return now < myDayStart || now >= myDayEnd;
}

/** The hero goes black at night while nothing is planned for now: no task, no time up, no Done confirmation. */
export function heroDark<T extends RankTask>(hero: HeroState<T>, night: boolean): boolean {
	return night && heroFocus(hero) === null;
}

/** The browser tab title, so a tab in the background is still an anchor: `28 min - Write intro`. */
export function tabTitle<T extends RankTask>(hero: HeroState<T>): string {
	switch (hero.kind) {
		case 'active':
		case 'wrapping-up':
			return `${formatMinutes(hero.left)} - ${hero.task.title}`;
		case 'time-up':
			return `Time is up - ${hero.ended.title}`;
		case 'free':
			return `Free until ${formatClock(hero.next.startTime)}`;
		case 'empty':
			return 'Nothing left today';
	}
}

/** How long ago a task ended, for the time up screen. */
export function endedAgo(over: number): string {
	return over < 1 ? 'Ended just now' : `Ended ${over} min ago`;
}

/** The wrap-up cue sounds for the minutes right after a task enters wrapping up, so a page loaded late stays quiet. */
const WRAP_UP_FRESH_MINUTES = 2;

/** True when the task entered its wrap-up within the last couple of minutes. */
export function wrapUpStarted(task: RankTask, now: number): boolean {
	const left = task.startTime + task.duration - now;
	const window = wrapUpWindow(task.duration);
	return left <= window && left > window - WRAP_UP_FRESH_MINUTES;
}

/** The heads-up line for the next task, in the hero instead of a toast. Only a task being wrapped up is told to wrap up. */
export function headsUpLine(next: RankTask, now: number, wrappingUp: boolean): string {
	const minutes = next.startTime - now;
	const line = `${next.title} starts in ${minutes} min`;
	return wrappingUp ? `${line}. Start wrapping up.` : line;
}
