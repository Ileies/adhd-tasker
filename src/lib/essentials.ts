/**
 * The essentials of a day (flow plan 5.3, roadmap E6): meals, meds and bed. Each is a routine with one time that the
 * first run offers to set up, and the sample day uses the same list at its default times. Meals may move up to an hour
 * to make room for an appointment (`shift`), meds and bed stay where they are. Pure.
 */
import type { RoutinePatch } from '#lib/core/repo.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { parseClock } from '#lib/taskform.js';
import { addDays, type DateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

export const ESSENTIAL_KEYS = ['meds', 'breakfast', 'lunch', 'dinner', 'teeth', 'bed'] as const;
export type EssentialKey = (typeof ESSENTIAL_KEYS)[number];

export interface Essential {
	key: EssentialKey;
	title: string;
	/** The question the first run asks, next to the time. */
	label: string;
	/** Default start, minutes since midnight. */
	time: number;
	duration: number;
	/** How far it may move for an appointment, see `placeday.ts`. */
	shift: number;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

export const ESSENTIALS: readonly Essential[] = [
	{ key: 'meds', title: 'Meds', label: 'Meds', time: at(7), duration: 15, shift: 0 },
	{
		key: 'breakfast',
		title: 'Breakfast',
		label: 'Breakfast',
		time: at(7, 45),
		duration: 30,
		shift: 60
	},
	{ key: 'lunch', title: 'Lunch', label: 'Lunch', time: at(12), duration: 45, shift: 60 },
	{ key: 'dinner', title: 'Dinner', label: 'Dinner', time: at(18), duration: 60, shift: 60 },
	{
		key: 'teeth',
		title: 'Brush teeth',
		label: 'Brush teeth',
		time: at(22, 30),
		duration: 10,
		shift: 0
	},
	{ key: 'bed', title: 'Go to bed', label: 'Bed time', time: at(22, 45), duration: 15, shift: 0 }
];

/** A time for each essential, `null` leaves it out. */
export type EssentialTimes = Record<EssentialKey, number | null>;

export const defaultTimes = (): EssentialTimes =>
	Object.fromEntries(ESSENTIALS.map(({ key, time }) => [key, time])) as EssentialTimes;

/** What the first run's form says: a switch and a `HH:MM` field for each essential. A switch off or a bad time leaves it out. */
export function essentialTimes(
	on: Record<EssentialKey, boolean>,
	clocks: Record<EssentialKey, string>
): EssentialTimes {
	return Object.fromEntries(
		ESSENTIALS.map(({ key }) => [key, on[key] ? parseClock(clocks[key]) : null])
	) as EssentialTimes;
}

/**
 * The daily routines for the essentials that have a time. A time too late for the length is moved back so the routine
 * ends at midnight at the latest, a key without a time (or with `null`) is left out. With `now`, an essential that is
 * over for today starts tomorrow, so the first screen does not open on a missed breakfast.
 */
export function essentialRoutines(
	times: Partial<Record<EssentialKey, number | null>>,
	now?: { today: DateKey; minutes: number }
): RoutinePatch[] {
	return ESSENTIALS.flatMap(({ key, title, duration, shift }) => {
		const time = times[key];
		if (time === undefined || time === null) return [];
		const startTime = Math.min(Math.max(0, Math.round(time)), DAY_MINUTES - duration);
		const over = now !== undefined && startTime + duration <= now.minutes;
		return [
			{
				title,
				startTime,
				duration,
				priority: Priority.High,
				shift,
				repeat: 'daily' as const,
				...(now && { firstDay: over ? addDays(now.today, 1) : now.today })
			}
		];
	});
}
