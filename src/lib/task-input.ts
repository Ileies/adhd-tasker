import {
	DAY,
	parseDuration,
	parsePriority,
	parseTime,
	parseTitle,
	type Parsed,
	type TaskPatch
} from '#lib/assistant-tools.js';
import { isDateKey } from '#lib/time.js';

/**
 * What the Plan and Now screens may send to `/edit`. The same rules as the assistant's tools
 * (titles, durations, priorities, the midnight rule), so chat and Plan can never disagree.
 * Create needs every field, update takes any subset. Other keys (`id`, `email`) are ignored.
 */
export function parseTaskInput(body: unknown, mode: 'create' | 'update'): Parsed<TaskPatch> {
	const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const patch: TaskPatch = {};
	const need = (field: string) => mode === 'create' && input[field] === undefined;
	const fail = (error: string) => ({ ok: false as const, error });

	if (need('title') || input.title !== undefined) {
		const title = parseTitle(input.title);
		if (!title) return fail('title is required (max 200 characters)');
		patch.title = title;
	}
	if (input.description !== undefined) {
		if (typeof input.description !== 'string') return fail('description must be text');
		patch.description = input.description.slice(0, 1000);
	} else if (mode === 'create') patch.description = '';
	if (need('date') || input.date !== undefined) {
		if (!isDateKey(input.date)) return fail('date must be YYYY-MM-DD');
		patch.date = input.date;
	}
	if (need('startTime') || input.startTime !== undefined) {
		const startTime = typeof input.startTime === 'number' ? parseTime(input.startTime) : undefined;
		if (startTime === undefined)
			return fail('startTime must be whole minutes since midnight, 0 to 1439');
		patch.startTime = startTime;
	}
	if (need('duration') || input.duration !== undefined) {
		const duration = parseDuration(input.duration);
		if (duration === undefined) return fail('duration must be a whole number from 5 to 1440');
		patch.duration = duration;
	}
	if (need('priority') || input.priority !== undefined) {
		const priority = parsePriority(input.priority);
		if (priority === undefined) return fail('priority must be 1 to 5');
		patch.priority = priority;
	}
	if (input.status !== undefined) {
		if (input.status !== 'pending' && input.status !== 'completed')
			return fail('status must be pending or completed');
		patch.status = input.status;
	}
	if (mode === 'update' && Object.keys(patch).length === 0) return fail('nothing to change');
	if (
		patch.startTime !== undefined &&
		patch.duration !== undefined &&
		!fitsInDay({ startTime: patch.startTime, duration: patch.duration })
	)
		return fail('tasks cannot cross midnight, split the task');
	return { ok: true, value: patch };
}

/** A task never crosses midnight. */
export function fitsInDay(task: { startTime: number; duration: number }) {
	return task.startTime + task.duration <= DAY;
}

/** The id of a task to change or delete, a whole number. */
export function parseTaskId(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * The `completedAt` a status change leaves behind: the time it became completed, cleared when it is reopened,
 * `undefined` (leave as is) when the status did not change. The flow engine replays these as today's points.
 */
export function completionStamp(
	before: { status: string } | null,
	status: string | undefined,
	now: number
): { completedAt: number | null } | Record<string, never> {
	const was = before?.status === 'completed';
	const is = status === undefined ? was : status === 'completed';
	if (was === is) return {};
	return { completedAt: is ? now : null };
}
