/**
 * The sample week a first time visitor can try, made of the same parts a real week is made of (flow plan phase 8):
 * routines for what repeats (the essentials and an ordinary day of chores, emails and breaks, no block for the work itself), to-dos for work
 * without a time (the first one is "Set up ADHD Tasker", so the setup is part of the day), one task per weekday in
 * the evening slot, and one appointment with its travel and the steps to prepare for it. The gaps between the
 * blocks stay empty: Now fills them with the to-do that needs the time. Pure. The device marks what it created
 * (tasks, routines and to-dos), so clearing the sample removes exactly these.
 */
import type { NewTask, NewTodo, RoutinePatch } from '#lib/core/repo.js';
import { defaultTimes, essentialRoutines } from '#lib/essentials.js';
import { DAY_MINUTES } from '#lib/plan.js';
import type { PrepForm } from '#lib/prep.js';
import type { Repeat } from '#lib/schedule.js';
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
		title: 'Break: stretch and water',
		start: at(10),
		duration: 15,
		priority: Low,
		days: 'weekdays'
	},
	{
		title: 'Emails and messages',
		start: at(10, 15),
		duration: 45,
		priority: Medium,
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

	{ title: 'Short walk outside', start: at(12, 45), duration: 15, priority: Low, days: 'all' },

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
		days: 'weekdays'
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

const REPEAT: Record<Days, Repeat> = { all: 'daily', weekdays: 'weekdays', weekend: 'days:0,6' };

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

/** The setup to-do is due today until this time of day, tomorrow after it. */
const SETUP_TODAY_UNTIL = at(20);

/** The day of the appointment, counted from today. The evening slot of that day is taken by it. */
const APPOINTMENT_IN_DAYS = 2;

export const SAMPLE_APPOINTMENT = {
	title: 'Dentist',
	start: at(17, 30),
	duration: 30,
	priority: Medium
};

/** What the appointment needs: half an hour to get there and two small steps, as the prep sheet would make them. */
export const SAMPLE_PREP: PrepForm = {
	travel: 30,
	prepare: null,
	steps: [
		{ title: 'Pack ID and the insurance card', minutes: 5 },
		{ title: 'Brush and floss before you leave', minutes: 10 }
	]
};

/** The routines of the sample: the essentials at their default times, then the repeating blocks of an ordinary day. */
export const sampleRoutines = (): RoutinePatch[] => [
	...essentialRoutines(defaultTimes()),
	...ROUTINE.map((block) => ({
		title: block.title,
		description: block.description ?? '',
		startTime: block.start,
		duration: block.duration,
		priority: block.priority,
		repeat: REPEAT[block.days]
	}))
];

const weekdayOf = (date: DateKey) => new Date(date + 'T00:00:00Z').getUTCDay();

/**
 * The tasks that are not routines, for each of the seven days from `today`: the evening block, and on one day the
 * appointment (the device adds its travel and steps with `prepPlan` and `SAMPLE_PREP`). A task that ended before `now`
 * today is already done. The night from 23:00 to 07:00 and the gaps are left empty.
 */
export function sampleDay(today: DateKey, now: number): (NewTask & { status: TaskStatus })[] {
	const appointmentDate = addDays(today, APPOINTMENT_IN_DAYS);
	return Array.from({ length: SAMPLE_DAYS }, (_, index) => {
		const date = addDays(today, index);
		const evening = EVENING[weekdayOf(date)];
		const fields =
			date === appointmentDate
				? {
						title: SAMPLE_APPOINTMENT.title,
						startTime: SAMPLE_APPOINTMENT.start,
						duration: SAMPLE_APPOINTMENT.duration,
						priority: SAMPLE_APPOINTMENT.priority,
						kind: 'appointment' as const
					}
				: {
						title: evening.title,
						startTime: EVENING_START,
						duration: EVENING_DURATION,
						priority: evening.priority
					};
		return {
			...fields,
			description: '',
			date,
			status:
				date === today && fields.startTime + fields.duration <= now
					? TaskStatus.Completed
					: TaskStatus.Pending
		};
	}).filter((task) => task.startTime + task.duration <= DAY_MINUTES);
}

/**
 * The to-dos of the sample, work without a time that the flow engine fits into the gaps. The first is the setup, due
 * today while there is still room for it (before 20:00, else tomorrow, so the first evening never says "does not
 * fit"): the first thing Now picks in a gap is the one that sets the app up.
 */
export function sampleTodos(today: DateKey, now: number): NewTodo[] {
	return [
		{
			title: 'Set up ADHD Tasker',
			description:
				'Open Settings: pick your sounds, check the hours of My day, choose light or dark. Then tap Done.',
			priority: High,
			estimate: 15,
			dueDate: now < SETUP_TODAY_UNTIL ? today : addDays(today, 1),
			nextStep: 'Open Settings'
		},
		{
			title: 'Buy a birthday gift',
			description: '',
			priority: Medium,
			estimate: 60,
			dueDate: addDays(today, 4)
		},
		{
			title: 'Taxes: gather the receipts',
			description: '',
			priority: Medium,
			estimate: 150,
			dueDate: addDays(today, 6)
		},
		{ title: 'Answer the old messages', description: '', priority: Low, estimate: 30 }
	];
}
