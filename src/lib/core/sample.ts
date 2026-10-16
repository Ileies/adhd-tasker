/**
 * The sample week a first time visitor can try: an ideal, ordinary routine on fixed clock times (focus blocks,
 * chores) for today and the six days after it, with one task per weekday in the evening slot. The essentials
 * (meals, meds, bed) are not in it: they are daily routines (`sampleRoutines`, flow plan 5.3) that the tick
 * makes into tasks like any routine. Whatever the time of day, the next block is a real one, and one single task
 * ("Set up ADHD Tasker") sits in the next break so the setup is part of the day. Pure. The device marks what it
 * created (tasks and routines), so clearing the sample removes exactly these.
 */
import type { NewTask, RoutinePatch } from '#lib/core/repo.js';
import { defaultTimes, essentialRoutines } from '#lib/essentials.js';
import { DAY_MINUTES } from '#lib/plan.js';
import { addDays, type DateKey } from '#lib/time.js';
import { Priority, TaskStatus } from '#lib/types.js';

type Days = 'all' | 'weekdays' | 'weekend';

interface Block {
	title: string;
	/** Minutes since midnight. */
	start: number;
	duration: number;
	priority: Priority;
	days: Days;
	/** A break the setup task may take the place of. */
	flex?: boolean;
	description?: string;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;
const { Low, Medium, High } = Priority;

const ROUTINE: Block[] = [
	{
		title: 'Shower and get dressed',
		start: at(7, 15),
		duration: 30,
		priority: Medium,
		days: 'all'
	},
	{
		title: 'Plan the day',
		start: at(8, 15),
		duration: 15,
		priority: Medium,
		days: 'all',
		description: 'Look at this list and pick the one thing that matters most today.'
	},

	{
		title: 'Focus: the most important task',
		start: at(8, 30),
		duration: 90,
		priority: High,
		days: 'weekdays'
	},
	{
		title: 'Break: stretch and water',
		start: at(10),
		duration: 15,
		priority: Low,
		days: 'weekdays',
		flex: true
	},
	{
		title: 'Emails and messages',
		start: at(10, 15),
		duration: 45,
		priority: Medium,
		days: 'weekdays'
	},
	{
		title: 'Focus: the second task',
		start: at(11),
		duration: 60,
		priority: High,
		days: 'weekdays'
	},

	{
		title: 'Tidy up: dishes, trash, desk',
		start: at(8, 30),
		duration: 60,
		priority: Medium,
		days: 'weekend'
	},
	{
		title: 'A hobby or a project',
		start: at(9, 30),
		duration: 150,
		priority: Medium,
		days: 'weekend'
	},

	{
		title: 'Short walk outside',
		start: at(12, 45),
		duration: 15,
		priority: Low,
		days: 'all',
		flex: true
	},

	{ title: 'Focus: deep work', start: at(13), duration: 90, priority: High, days: 'weekdays' },
	{
		title: 'Go out: friends, sport or fresh air',
		start: at(13),
		duration: 120,
		priority: Medium,
		days: 'weekend'
	},
	{
		title: 'Break: snack and stretch',
		start: at(14, 30),
		duration: 15,
		priority: Low,
		days: 'weekdays',
		flex: true
	},
	{
		title: 'Emails and loose ends',
		start: at(14, 45),
		duration: 45,
		priority: Medium,
		days: 'weekdays'
	},
	{
		title: 'Exercise or a long walk',
		start: at(15, 30),
		duration: 60,
		priority: Medium,
		days: 'all'
	},

	{ title: 'Clean the kitchen', start: at(19), duration: 15, priority: Medium, days: 'all' },
	{
		title: 'Pack your bag and lay out clothes',
		start: at(20, 30),
		duration: 15,
		priority: Medium,
		days: 'all'
	},
	{
		title: 'Plan tomorrow',
		start: at(20, 45),
		duration: 15,
		priority: Medium,
		days: 'all',
		description: 'Look at tomorrow and move what will not fit.'
	},
	{
		title: 'Shower and get ready for bed',
		start: at(21),
		duration: 30,
		priority: Medium,
		days: 'all'
	},
	{
		title: 'Wind down: screens off, read',
		start: at(21, 30),
		duration: 60,
		priority: Low,
		days: 'all'
	},
	{ title: 'Brush teeth', start: at(22, 30), duration: 15, priority: Medium, days: 'all' }
];

/** The one block that changes with the weekday, in the slot before dinner. Index is `getUTCDay()`, Sunday is 0. */
const EVENING: { title: string; priority: Priority }[] = [
	{ title: 'Plan the week: calendar and goals', priority: Medium },
	{ title: 'Weekly review: bills, mail, deadlines', priority: Medium },
	{ title: 'Gym, run or a workout at home', priority: Medium },
	{ title: 'Groceries for the next days', priority: Medium },
	{ title: 'Call family or a friend', priority: Medium },
	{ title: 'Clean one room', priority: Medium },
	{ title: 'Laundry and fresh sheets', priority: Medium }
];

const EVENING_START = at(17);
const EVENING_DURATION = 60;

/** How many days the sample covers, today included. */
export const SAMPLE_DAYS = 7;

const SETUP = {
	title: 'Set up ADHD Tasker',
	duration: 15,
	priority: High,
	description:
		'Open Settings: pick your sounds, check the hours of My day, choose light or dark. Then tap Done.'
};

/** The routines of the sample: the essentials at their default times. */
export const sampleRoutines = (): RoutinePatch[] => essentialRoutines(defaultTimes());

const weekdayOf = (date: DateKey) => new Date(date + 'T00:00:00Z').getUTCDay();

function appliesOn(days: Days, weekday: number) {
	const weekend = weekday === 0 || weekday === 6;
	return days === 'all' || (days === 'weekend') === weekend;
}

/**
 * The routine for each of the seven days from `today`. A task that ended before `now` today is already done.
 * The setup task takes the place of the first break that has not started yet (today, else a later day).
 * The gaps between the blocks and the night from 23:00 to 07:00 are left empty: Now fills a gap with what the user
 * has to do (a to-do), or asks what is next.
 */
export function sampleDay(today: DateKey, now: number): (NewTask & { status: TaskStatus })[] {
	const days = Array.from({ length: SAMPLE_DAYS }, (_, index) => {
		const date = addDays(today, index);
		const weekday = weekdayOf(date);
		const blocks: Block[] = [
			...ROUTINE.filter((block) => appliesOn(block.days, weekday)),
			{
				...EVENING[weekday],
				start: EVENING_START,
				duration: EVENING_DURATION,
				days: 'all'
			}
		];
		return { date, blocks };
	});

	const upcoming = days.flatMap(({ date, blocks }, index) =>
		blocks
			.filter((block) => block.flex && (index > 0 || block.start >= now))
			.map((block) => ({ date, block }))
	);
	const setupAt = upcoming.sort(
		(a, b) => a.date.localeCompare(b.date) || a.block.start - b.block.start
	)[0];

	return days.flatMap(({ date, blocks }) =>
		blocks
			.filter((block) => block.start + block.duration <= DAY_MINUTES)
			.map((block) => {
				const replaced = setupAt && setupAt.date === date && setupAt.block === block;
				const task = replaced ? { ...block, ...SETUP } : block;
				return {
					title: task.title,
					description: task.description ?? '',
					date,
					startTime: block.start,
					duration: task.duration,
					priority: task.priority,
					status:
						date === today && block.start + task.duration <= now
							? TaskStatus.Completed
							: TaskStatus.Pending
				};
			})
	);
}
