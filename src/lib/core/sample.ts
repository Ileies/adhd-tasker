/**
 * The sample day a first time visitor can try: a few tasks around the time of day it is, so Now has a
 * task running at once. Pure. The device marks what it created, so clearing the sample removes exactly these.
 */
import type { NewTask } from '#lib/core/repo.js';
import { DAY_MINUTES, SNAP } from '#lib/plan.js';
import { Priority, TaskStatus } from '#lib/types.js';

/** Where each sample task sits, in minutes from the start of the one that is running. */
const TEMPLATE: { title: string; offset: number; duration: number; priority: Priority }[] = [
	{ title: 'Check the day', offset: -30, duration: 15, priority: Priority.Medium },
	{ title: 'Write the report intro', offset: 0, duration: 60, priority: Priority.High },
	{ title: 'Reply to messages', offset: 75, duration: 30, priority: Priority.Medium },
	{ title: 'Take a walk', offset: 120, duration: 30, priority: Priority.Low },
	{ title: 'Plan tomorrow', offset: 165, duration: 15, priority: Priority.Medium }
];

/** How far into the running task the sample starts, at the most. */
const HEAD_START = SNAP;

/**
 * Four or five tasks for `today`, exactly one of them running at `now` (minutes since midnight). A task
 * that would not fit before or after midnight is left out, none ever crosses it. The task before the
 * running one is already done.
 */
export function sampleDay(today: string, now: number): (NewTask & { status: TaskStatus })[] {
	const running = TEMPLATE[1];
	const start = Math.max(
		0,
		Math.min(Math.floor(now / SNAP) * SNAP - HEAD_START, DAY_MINUTES - running.duration)
	);
	return TEMPLATE.map((task) => ({ ...task, startTime: start + task.offset }))
		.filter((task) => task.startTime >= 0 && task.startTime + task.duration <= DAY_MINUTES)
		.map(({ title, startTime, duration, priority }) => ({
			title,
			description: '',
			date: today,
			startTime,
			duration,
			priority,
			status: startTime + duration <= start ? TaskStatus.Completed : TaskStatus.Pending
		}));
}
