/**
 * What to do in a break (`docs/flow-plan.md` 5.7). A fixed library of concrete, screen free, body first things, so a
 * person who is out of steam is told what to do and does not have to think of it. Pure: the choice only depends on what
 * is passed in, the activity is written to the break row so the screen shows the same one after a reload.
 */

export interface BreakActivity {
	id: string;
	/** What the hero says, one or two plain sentences. */
	text: string;
	/** Something to eat: not offered shortly before a meal. */
	food?: boolean;
	/** Needs the outside and daylight. */
	outdoors?: boolean;
	/** Needs at least this many minutes. */
	minMinutes?: number;
}

export const BREAK_ACTIVITIES: readonly BreakActivity[] = [
	{
		id: 'water',
		text: 'Stand up and stretch. Fill a glass of water and drink it at the window.'
	},
	{ id: 'window', text: 'Look out of the window at something far away. Let your eyes rest.' },
	{
		id: 'walk',
		text: 'Walk around the block without your phone.',
		outdoors: true,
		minMinutes: 10
	},
	{ id: 'tea', text: 'Make a tea or a coffee and drink it away from the desk.' },
	{ id: 'lie-down', text: 'Lie down with your eyes closed. No screen.' },
	{ id: 'song', text: 'Put on one song and move to it.' },
	{ id: 'snack', text: 'Eat a small snack and drink some water. No phone.', food: true }
];

/** A meal this close makes a snack a bad idea. */
export const MEAL_NEAR_MINUTES = 45;
const MEAL_WORDS = /\b(breakfast|brunch|lunch|dinner|supper|meal|eat|food|snack)\b/i;

export const isMeal = (title: string): boolean => MEAL_WORDS.test(title);

export interface BreakChoice {
	/** How long the break is. */
	minutes: number;
	/** The ids of the last activities, newest last. The same one never comes twice in a row. */
	recent: readonly string[];
	/** The next time-bound item and in how many minutes it starts, `null` when none is left today. */
	next: { title: string; inMinutes: number } | null;
	/** Light out. Sun times know, `null` when unknown counts as light. */
	daylight: boolean | null;
	/** Any whole number: it picks among the activities that fit, so a test can pin the choice. */
	seed: number;
}

/** The activity for a break. There is always one: the rules only ever take things away from a list that is longer. */
export function breakActivity(choice: BreakChoice): BreakActivity {
	const { minutes, recent, next, daylight, seed } = choice;
	const mealNear = next !== null && isMeal(next.title) && next.inMinutes <= MEAL_NEAR_MINUTES;
	const fits = BREAK_ACTIVITIES.filter(
		(activity) =>
			!(activity.food && mealNear) &&
			!(activity.outdoors && daylight === false) &&
			!(activity.minMinutes !== undefined && minutes < activity.minMinutes) &&
			!(activity.minMinutes !== undefined && next !== null && next.inMinutes < minutes + 5) &&
			activity.id !== recent.at(-1)
	);
	const list = fits.length > 0 ? fits : BREAK_ACTIVITIES.filter((activity) => !activity.food);
	return list[Math.abs(Math.trunc(seed)) % list.length];
}

/** The activity a break row names, the first one when the id is unknown (a row from a newer version). */
export const activityById = (id: unknown): BreakActivity =>
	BREAK_ACTIVITIES.find((activity) => activity.id === id) ?? BREAK_ACTIVITIES[0];
