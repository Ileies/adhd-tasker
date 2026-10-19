/**
 * The sample week a first time visitor can try. It must fit anybody, so the content is as ordinary as possible and
 * nothing in it draws attention: what the visitor should notice is what the app does with it. The routines are the
 * essentials and three plain anchors (plan the day, a short walk, winding down), there is one plain appointment with
 * its travel and steps, and the to-dos are the work most adults carry: two big ones with a deadline (the taxes,
 * cleaning the apartment) and a few small errands. The hours between the fixed things stay empty: Now fills them with
 * the to-do that needs the time, holds it, asks how far you got and rotates. Pure. The device marks what it created
 * (tasks, routines and to-dos), so clearing the sample removes exactly these.
 */
import type { NewTask, NewTodo, RoutinePatch } from '#lib/core/repo.js';
import { defaultTimes, essentialRoutines } from '#lib/essentials.js';
import { DAY_MINUTES } from '#lib/plan.js';
import type { PrepForm } from '#lib/prep.js';
import { addDays, type DateKey } from '#lib/time.js';
import { Priority, TaskStatus } from '#lib/types.js';

interface Block {
	title: string;
	/** Minutes since midnight. */
	start: number;
	duration: number;
	priority: Priority;
	description?: string;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;
const { Low, Medium, High } = Priority;

const ROUTINE: Block[] = [
	{
		title: 'Plan the day',
		start: at(8, 15),
		duration: 15,
		priority: Medium,
		description: 'Look at this list and pick the one thing that matters most today.'
	},
	{ title: 'Short walk outside', start: at(12, 45), duration: 15, priority: Low },
	{
		title: 'Wind down: screens off, read',
		start: at(21, 30),
		duration: 60,
		priority: Low
	}
];

/** How many days the sample covers, today included. */
export const SAMPLE_DAYS = 7;

/** The setup to-do is due today until this time of day, tomorrow after it. */
const SETUP_TODAY_UNTIL = at(20);

/** The day of the appointment, counted from today. */
const APPOINTMENT_IN_DAYS = 3;

export const SAMPLE_APPOINTMENT = {
	title: 'Appointment',
	start: at(14),
	duration: 60,
	priority: High
};

/** What the appointment needs, as the prep sheet would make it: half an hour to get there and two small steps. */
export const SAMPLE_PREP: PrepForm = {
	travel: 30,
	prepare: null,
	steps: [
		{ title: 'Check the address', minutes: 5 },
		{ title: 'Pack what you need', minutes: 5 }
	]
};

/** The routines of the sample: the essentials at their default times, then a few anchors every day has. */
export const sampleRoutines = (): RoutinePatch[] => [
	...essentialRoutines(defaultTimes()),
	...ROUTINE.map((block) => ({
		title: block.title,
		description: block.description ?? '',
		startTime: block.start,
		duration: block.duration,
		priority: block.priority,
		kind: 'block' as const,
		repeat: 'daily' as const
	}))
];

/**
 * The tasks that are not routines: the appointment, a few days ahead (the device adds its travel and steps with
 * `prepPlan` and `SAMPLE_PREP`). A task that ended before `now` today is already done. Everything else about the week
 * is a routine or a to-do, and the gaps are left empty.
 */
export function sampleDay(today: DateKey, now: number): (NewTask & { status: TaskStatus })[] {
	const date = addDays(today, APPOINTMENT_IN_DAYS);
	const appointment = {
		title: SAMPLE_APPOINTMENT.title,
		description: '',
		date,
		startTime: SAMPLE_APPOINTMENT.start,
		duration: SAMPLE_APPOINTMENT.duration,
		priority: SAMPLE_APPOINTMENT.priority,
		kind: 'appointment' as const,
		status:
			date === today && SAMPLE_APPOINTMENT.start + SAMPLE_APPOINTMENT.duration <= now
				? TaskStatus.Completed
				: TaskStatus.Pending
	};
	return [appointment].filter((task) => task.startTime + task.duration <= DAY_MINUTES);
}

/**
 * The to-dos of the sample, work without a time that the flow engine fits into the gaps. The first is the setup, due
 * today while there is still room for it (before 20:00, else tomorrow, so the first evening never says "does not
 * fit"). The taxes and the cleaning are two big pieces of work with a due date and no time, so the app has something
 * to hold you on and something to rotate to. The errands are small and plain.
 */
export function sampleTodos(today: DateKey, now: number): NewTodo[] {
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
		{
			title: 'Do the taxes',
			description: '',
			priority: High,
			estimate: 4 * 60,
			dueDate: addDays(today, 5),
			nextStep: 'Gather the papers'
		},
		{
			title: 'Clean the apartment',
			description: '',
			priority: Medium,
			estimate: 2 * 60,
			dueDate: addDays(today, 3),
			nextStep: 'Clear the kitchen'
		},
		{
			title: 'Buy groceries',
			description: '',
			priority: Medium,
			estimate: 45,
			dueDate: addDays(today, 1)
		},
		{
			title: 'Pay the bills',
			description: '',
			priority: Medium,
			estimate: 20,
			dueDate: addDays(today, 2)
		},
		{
			title: 'Call the bank',
			description: '',
			priority: Low,
			estimate: 15,
			dueDate: addDays(today, 4)
		},
		{ title: 'Answer emails', description: '', priority: Low, estimate: 30 }
	];
}
