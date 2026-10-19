/**
 * The sample week a first time visitor can try. It is meant as their own week, not a demo: everything in it must
 * already be true for nearly everybody, so it works without changing anything first. The routines are the meals, bed
 * and work or school on weekdays; the to-dos are the chores every week has, due by its end, and the setup. No
 * appointment, deadline or errand that only some people have. The hours outside the routines stay empty: Now fills
 * them with the to-do that needs the time, holds it, asks how far you got and rotates. Pure. The device marks what it
 * created (routines and to-dos), so clearing the sample removes exactly these.
 */
import type { NewTodo, RoutinePatch } from '#lib/core/repo.js';
import { defaultTimes, essentialRoutines } from '#lib/essentials.js';
import { addDays, type DateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

const at = (hour: number, minute = 0) => hour * 60 + minute;
const { Low, Medium } = Priority;

/** Work or school, around lunch. Somebody else's hours: it ends on its own and never asks "Time is up". */
const WORK = [
	{ start: at(9), duration: 3 * 60 },
	{ start: at(13), duration: 4 * 60 }
];

/** How many days the sample covers, today included. */
export const SAMPLE_DAYS = 7;

/** The setup to-do is due today until this time of day, tomorrow after it. */
const SETUP_TODAY_UNTIL = at(20);

/** The routines of the sample: the meals and bed at their default times (not meds, most people take none) and work. */
export const sampleRoutines = (): RoutinePatch[] => [
	...essentialRoutines({ ...defaultTimes(), meds: null }),
	...WORK.map(({ start, duration }) => ({
		title: 'Work or school',
		description: '',
		startTime: start,
		duration,
		priority: Medium,
		kind: 'appointment' as const,
		repeat: 'weekdays' as const
	}))
];

/**
 * The to-dos of the sample, work without a time that the flow engine fits into the gaps. The first is the setup, due
 * today while there is still room for it (before 20:00, else tomorrow, so the first evening never says "does not
 * fit"). The chores are due by the end of the week; laundry and cleaning are big enough to hold a session and to
 * rotate between.
 */
export function sampleTodos(today: DateKey, now: number): NewTodo[] {
	const endOfWeek = addDays(today, SAMPLE_DAYS - 1);
	const chore = (title: string, estimate: number, priority = Medium): NewTodo => ({
		title,
		description: '',
		priority,
		estimate,
		dueDate: endOfWeek
	});
	return [
		{
			title: 'Set up ADHD Tasker',
			description:
				'Open Settings: pick your sounds, check the hours of My day, choose light or dark. Then tap Done.',
			priority: Medium,
			estimate: 15,
			dueDate: now < SETUP_TODAY_UNTIL ? today : addDays(today, 1),
			nextStep: 'Open Settings'
		},
		chore('Buy groceries', 60),
		chore('Do the laundry', 90),
		chore('Clean up at home', 2 * 60),
		chore('Reply to messages', 30, Low)
	];
}
