/**
 * The sample week a first time visitor can try. It tells what the app is for, so it is a student's week and not a
 * chore chart: the essentials and a few anchors as routines (a lecture, a walk, exercise, winding down), one exam in
 * four days with its travel and a long study step, a lab report with a deadline, and some small to-dos. The hours
 * between the fixed things stay empty: Now fills them with the to-do that needs the time, asks how far you got and
 * rotates. Pure. The device marks what it created (tasks, routines and to-dos), so clearing the sample removes
 * exactly these.
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
	/** Somebody else's time: it ends on its own and is never time up. */
	appointment?: boolean;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;
const { Low, Medium, High } = Priority;

const ROUTINE: Block[] = [
	{
		title: 'Plan the day',
		start: at(8, 15),
		duration: 15,
		priority: Medium,
		days: 'all',
		description: 'Look at this list and pick the one thing that matters most today.'
	},
	{
		title: 'Lecture: Algorithms',
		start: at(10, 15),
		duration: 90,
		priority: Medium,
		days: 'weekdays',
		appointment: true
	},
	{ title: 'Short walk outside', start: at(12, 45), duration: 15, priority: Low, days: 'all' },
	{
		title: 'Go out: friends, sport or fresh air',
		start: at(9, 30),
		duration: 120,
		priority: Medium,
		days: 'weekend'
	},
	{
		title: 'Exercise or a long walk',
		start: at(17),
		duration: 60,
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
		title: 'Wind down: screens off, read',
		start: at(21, 30),
		duration: 60,
		priority: Low,
		days: 'all'
	}
];

const REPEAT: Record<Days, Repeat> = { all: 'daily', weekdays: 'weekdays', weekend: 'days:0,6' };

/** How many days the sample covers, today included. */
export const SAMPLE_DAYS = 7;

/** The setup to-do is due today until this time of day, tomorrow after it. */
const SETUP_TODAY_UNTIL = at(20);

/** The day of the exam, counted from today. */
const APPOINTMENT_IN_DAYS = 4;

export const SAMPLE_APPOINTMENT = {
	title: 'Math exam',
	start: at(14),
	duration: 120,
	priority: High
};

/**
 * What the exam needs, as the prep sheet would make it: half an hour to get there, a long study step that starts at
 * 0 % and a small one. Study is why the days before it are never empty.
 */
export const SAMPLE_PREP: PrepForm = {
	travel: 30,
	prepare: null,
	steps: [
		{ title: 'Study for the Math exam', minutes: 8 * 60 },
		{ title: 'Pack student ID, pens and calculator', minutes: 5 }
	]
};

/** The routines of the sample: the essentials at their default times, then the anchors of a student's day. */
export const sampleRoutines = (): RoutinePatch[] => [
	...essentialRoutines(defaultTimes()),
	...ROUTINE.map((block) => ({
		title: block.title,
		description: block.description ?? '',
		startTime: block.start,
		duration: block.duration,
		priority: block.priority,
		kind: block.appointment ? ('appointment' as const) : ('block' as const),
		repeat: REPEAT[block.days]
	}))
];

/**
 * The tasks that are not routines: the exam, a few days ahead (the device adds its travel and steps with `prepPlan`
 * and `SAMPLE_PREP`). A task that ended before `now` today is already done. Everything else about the week is a
 * routine or a to-do, and the gaps are left empty.
 */
export function sampleDay(today: DateKey, now: number): (NewTask & { status: TaskStatus })[] {
	const date = addDays(today, APPOINTMENT_IN_DAYS);
	const exam = {
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
	return [exam].filter((task) => task.startTime + task.duration <= DAY_MINUTES);
}

/**
 * The to-dos of the sample, work without a time that the flow engine fits into the gaps. The first is the setup, due
 * today while there is still room for it (before 20:00, else tomorrow, so the first evening never says "does not
 * fit"). The lab report is the second big piece of work next to the exam's study step, so the app has something to
 * rotate to.
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
			title: 'Lab report for Physics',
			description: 'Introduction, method, results. Start with the outline.',
			priority: High,
			estimate: 3 * 60,
			dueDate: addDays(today, 5),
			nextStep: 'Write the outline'
		},
		{
			title: 'Buy a birthday gift',
			description: '',
			priority: Medium,
			estimate: 60,
			dueDate: addDays(today, 3)
		},
		{ title: 'Answer the old messages', description: '', priority: Low, estimate: 30 }
	];
}
