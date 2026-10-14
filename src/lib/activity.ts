import { formatClock } from '#lib/format.js';
import type { Task } from '#lib/types.js';

type Snapshot = Pick<Task, 'title' | 'date' | 'startTime' | 'duration'> | null;

/** One line saying what an assistant change did, for the activity log and the toast. */
export function summarizeAction(tool: string, before: Snapshot, after: Snapshot): string {
	switch (tool) {
		case 'add_task':
			return after ? `Added ${after.title} at ${formatClock(after.startTime)}` : 'Added a task';
		case 'delete_task':
			return before ? `Deleted ${before.title}` : 'Deleted a task';
		case 'update_task': {
			if (!before || !after) return 'Changed a task';
			if (before.date !== after.date) return `Moved ${after.title} to ${after.date} ${formatClock(after.startTime)}`;
			if (before.startTime !== after.startTime) return `Moved ${after.title} to ${formatClock(after.startTime)}`;
			if (before.duration !== after.duration) return `Resized ${after.title} to ${after.duration} min`;
			return `Updated ${after.title}`;
		}
		default:
			return 'Changed the plan';
	}
}

/** Dates a change touched, so the client knows which days to reload. */
export function datesOfAction(before: Snapshot, after: Snapshot): string[] {
	return [...new Set([before?.date, after?.date].filter((date): date is string => !!date))];
}
