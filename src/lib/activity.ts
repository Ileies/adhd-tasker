import { formatClock } from '#lib/format.js';

/** What a change is shown from: the task, to-do or routine as it was and became (the tool says which). Fields a kind does not have are absent. */
type Snapshot = {
	title: string;
	date?: string;
	startTime?: number;
	duration?: number;
	status?: string;
	dueDate?: string | null;
} | null;

const at = (startTime: number | undefined) =>
	startTime === undefined ? '' : formatClock(startTime);

/** One line saying what an assistant change did, for the activity log and the toast. */
export function summarizeAction(tool: string, before: Snapshot, after: Snapshot): string {
	switch (tool) {
		case 'add_task':
			return after ? `Added ${after.title} at ${at(after.startTime)}` : 'Added a task';
		case 'delete_task':
			return before ? `Deleted ${before.title}` : 'Deleted a task';
		case 'update_task': {
			if (!before || !after) return 'Changed a task';
			if (before.date !== after.date)
				return `Moved ${after.title} to ${after.date} ${at(after.startTime)}`;
			if (before.startTime !== after.startTime)
				return `Moved ${after.title} to ${at(after.startTime)}`;
			if (before.duration !== after.duration)
				return `Resized ${after.title} to ${after.duration} min`;
			return `Updated ${after.title}`;
		}
		case 'add_todo':
			return after ? `Added the to-do ${after.title}` : 'Added a to-do';
		case 'delete_todo':
			return before ? `Deleted the to-do ${before.title}` : 'Deleted a to-do';
		case 'update_todo': {
			if (!before || !after) return 'Changed a to-do';
			if (before.status !== after.status)
				return after.status === 'done'
					? `Marked ${after.title} done`
					: after.status === 'dropped'
						? `Dropped ${after.title}`
						: `Reopened ${after.title}`;
			if (before.dueDate !== after.dueDate)
				return after.dueDate
					? `Moved the due date of ${after.title} to ${after.dueDate}`
					: `Removed the due date of ${after.title}`;
			return `Updated the to-do ${after.title}`;
		}
		case 'add_routine':
			return after ? `Added the routine ${after.title}` : 'Added a routine';
		case 'delete_routine':
			return before ? `Deleted the routine ${before.title}` : 'Deleted a routine';
		case 'update_routine':
			return after ? `Changed the routine ${after.title}` : 'Changed a routine';
		default:
			return 'Changed the plan';
	}
}

/** Dates a change touched, so the client knows which days to reload. To-dos and routines tell the screens with a hint instead. */
export function datesOfAction(before: Snapshot, after: Snapshot): string[] {
	return [...new Set([before?.date, after?.date].filter((date): date is string => !!date))];
}
