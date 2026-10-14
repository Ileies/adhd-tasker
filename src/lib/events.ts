import { rank, switchReason, type RankTask } from '#lib/priority.js';
import { formatClock } from '#lib/format.js';
import { Priority, TaskStatus, type Task } from '#lib/types.js';

/** Everything the agent can observe. `origin` says who caused it, agent events never wake the agent again. */
export const EVENT_TYPES = [
	'task.created',
	'task.updated',
	'task.completed',
	'task.deleted',
	'task.switched',
	'task.missed',
	'task.overrun',
	'user.message',
	'alarm.fired',
	'wakeup.fired'
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type EventOrigin = 'user' | 'agent' | 'system';

export const isEventType = (value: unknown): value is EventType => EVENT_TYPES.includes(value as EventType);

/** Minutes after a window ended until a task counts as missed, so finishing a little late is not an event. */
export const MISSED_GRACE_MINUTES = 5;
/** Minutes after the window ended until the latest unfinished task counts as an overrun (hyperfocus). */
export const OVERRUN_MINUTES = 15;
/** Windows that ended longer ago than this are history, a restart must not announce them. */
export const STALE_MINUTES = 90;

export interface DetectedEvent {
	type: 'task.switched' | 'task.missed' | 'task.overrun';
	/** Stops the same fact from being logged twice, one row per key. */
	key: string;
	payload: Record<string, unknown>;
}

export interface Detection {
	events: DetectedEvent[];
	/** What the next tick compares against. */
	currentId: number | null;
}

type DetectTask = RankTask & { date: string };

/**
 * One scheduler tick for one user: runs the same `rank()` as the screen and reports what changed.
 * `previousId` is the task that was current at the last tick, undefined when it was never tracked
 * (then nothing is reported as a switch). `tasks` are today's tasks only.
 */
export function detectEvents<T extends DetectTask>(tasks: T[], now: number, previousId: number | null | undefined): Detection {
	const ranking = rank(tasks, now);
	const currentId = ranking.current?.id ?? null;
	const events: DetectedEvent[] = [];

	if (previousId !== undefined && previousId !== currentId) {
		const previous = tasks.find((task) => task.id === previousId) ?? null;
		// A task that is gone from today's list (deleted, moved to another day) is reported as removed
		const stub = previous ?? ({ id: previousId, title: '', startTime: 0, duration: 0, priority: Priority.Medium, status: TaskStatus.Pending } as T);
		const reason = switchReason(previousId === null ? null : stub, ranking, tasks, now) ?? 'Current task changed';
		events.push({
			type: 'task.switched',
			key: `switched:${previousId}:${currentId}:${tasks[0]?.date ?? ''}:${now}`,
			payload: { from: previous?.title ?? null, fromId: previousId, to: ranking.current?.title ?? null, toId: currentId, reason }
		});
	}

	// Most recently ended unfinished task first, that is the one the user is most likely still inside
	ranking.missed.forEach((task, index) => {
		const overBy = now - (task.startTime + task.duration);
		if (overBy > STALE_MINUTES) return;
		const base = { taskId: task.id, title: task.title, minutesOver: overBy };
		const stamp = `${task.id}:${task.date}:${task.startTime + task.duration}`;
		if (overBy >= MISSED_GRACE_MINUTES) events.push({ type: 'task.missed', key: `missed:${stamp}`, payload: base });
		if (index === 0 && overBy >= OVERRUN_MINUTES) events.push({ type: 'task.overrun', key: `overrun:${stamp}`, payload: base });
	});

	return { events, currentId };
}

type ChangeTask = Pick<Task, 'id' | 'title' | 'description' | 'date' | 'startTime' | 'duration' | 'priority' | 'status'>;
const WATCHED = ['title', 'description', 'date', 'startTime', 'duration', 'priority'] as const;

/**
 * Turns a before/after pair of one task into the event it is. Returns null when nothing a person would notice changed.
 * Completing or reopening is its own event type, everything else is created, updated or deleted.
 */
export function describeChange(before: ChangeTask | null, after: ChangeTask | null): { type: EventType; payload: Record<string, unknown> } | null {
	const task = after ?? before;
	if (!task) return null;
	const base = { taskId: task.id, title: task.title, date: task.date, startTime: task.startTime };

	if (!before) return { type: 'task.created', payload: base };
	if (!after) return { type: 'task.deleted', payload: base };

	const wasDone = before.status === TaskStatus.Completed;
	const isDone = after.status === TaskStatus.Completed;
	if (wasDone !== isDone) return { type: 'task.completed', payload: { ...base, completed: isDone } };

	const changed = WATCHED.filter((field) => before[field] !== after[field]);
	if (changed.length === 0) return null;
	return { type: 'task.updated', payload: { ...base, changed, from: { date: before.date, startTime: before.startTime, duration: before.duration } } };
}

/** One line per event for the model and for the activity log. Titles are the user's data, so they are quoted. */
export function describeEvent(type: EventType, payload: Record<string, unknown>): string {
	const line = describeBase(type, payload);
	return payload.undoOfAgentChange ? `${line} (the user undid a change the assistant made)` : line;
}

function describeBase(type: EventType, payload: Record<string, unknown>): string {
	const title = typeof payload.title === 'string' ? `"${payload.title}"` : 'a task';
	const clock = typeof payload.startTime === 'number' ? ` at ${formatClock(payload.startTime)}` : '';
	switch (type) {
		case 'task.created':
			return `Task ${title} was added${clock}`;
		case 'task.updated':
			return `Task ${title} was changed (${Array.isArray(payload.changed) ? payload.changed.join(', ') : 'details'})`;
		case 'task.completed':
			return payload.completed === false ? `Task ${title} was reopened` : `Task ${title} was marked done`;
		case 'task.deleted':
			return `Task ${title} was deleted`;
		case 'task.switched':
			return `The current task changed from ${payload.from ? `"${payload.from}"` : 'nothing'} to ${payload.to ? `"${payload.to}"` : 'nothing'}: ${payload.reason}`;
		case 'task.missed':
			return `Task ${title} was not finished, its time ended ${payload.minutesOver} minutes ago`;
		case 'task.overrun':
			return `Task ${title} is still not marked done ${payload.minutesOver} minutes after its planned end`;
		case 'user.message':
			return 'The user sent a message';
		case 'alarm.fired':
			return `Alarm "${payload.label}" rang (set by ${payload.createdBy})`;
		case 'wakeup.fired':
			return `You woke yourself up on purpose. Your own note: "${payload.note}"`;
	}
}
