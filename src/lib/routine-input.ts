import {
	parseDuration,
	parsePriority,
	parseTime,
	parseTitle,
	type Parsed
} from '#lib/assistant-tools.js';
import type { NewRoutine, RoutinePatch } from '#lib/core/repo.js';
import { MAX_SHIFT } from '#lib/placeday.js';
import { parseRepeat } from '#lib/schedule.js';
import { fitsInDay } from '#lib/task-input.js';
import { isDateKey } from '#lib/time.js';
import { Priority } from '#lib/types.js';

const ROUTINE_KINDS = ['block', 'appointment'] as const;

/** A person's routines are few: Lunch, Meds, Bed. The limit keeps a wrong file from filling the plan. */
export const MAX_ROUTINES = 50;

const isWhole = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * What the screens and `/routines` may send for a routine, with the same rules as a task at a time (titles, times,
 * durations, priorities, the midnight rule). Create needs a title, a start, a duration and a repeat. Update takes
 * any subset. Other keys (`id`, `through`, which only the rules write) are ignored.
 */
export function parseRoutineInput(body: unknown, mode: 'create' | 'update'): Parsed<RoutinePatch> {
	const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const patch: RoutinePatch = {};
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
	if (input.priority !== undefined) {
		const priority = parsePriority(input.priority);
		if (priority === undefined) return fail('priority must be 1 to 5');
		patch.priority = priority;
	}
	if (input.shift !== undefined) {
		if (!isWhole(input.shift, 0, MAX_SHIFT))
			return fail(`shift must be whole minutes from 0 to ${MAX_SHIFT}`);
		patch.shift = input.shift;
	}
	if (input.kind !== undefined) {
		if (!ROUTINE_KINDS.includes(input.kind as (typeof ROUTINE_KINDS)[number]))
			return fail('kind must be block or appointment');
		patch.kind = input.kind as RoutinePatch['kind'];
	}
	if (need('repeat') || input.repeat !== undefined) {
		const repeat = parseRepeat(input.repeat);
		if (repeat === null || repeat === 'none')
			return fail('repeat must be daily, weekdays or days:1,3 (0 Sunday to 6 Saturday)');
		patch.repeat = repeat;
	}
	if (input.firstDay !== undefined) {
		if (!isDateKey(input.firstDay)) return fail('firstDay must be YYYY-MM-DD');
		patch.firstDay = input.firstDay;
	}
	if (input.lastDay !== undefined) {
		if (input.lastDay !== null && !isDateKey(input.lastDay))
			return fail('lastDay must be YYYY-MM-DD or null');
		patch.lastDay = input.lastDay;
	}

	if (mode === 'update' && Object.keys(patch).length === 0) return fail('nothing to change');
	if (
		patch.startTime !== undefined &&
		patch.duration !== undefined &&
		!fitsInDay({ startTime: patch.startTime, duration: patch.duration })
	)
		return fail('routines cannot cross midnight, split the routine');
	if (
		patch.firstDay !== undefined &&
		patch.lastDay !== undefined &&
		patch.lastDay !== null &&
		patch.lastDay < patch.firstDay
	)
		return fail('lastDay is before firstDay');
	return { ok: true, value: patch };
}

/** The id of a routine to change or delete, a whole number. */
export function parseRoutineId(value: unknown): number | undefined {
	return isWhole(value, 1, Number.MAX_SAFE_INTEGER) ? value : undefined;
}

/** A create patch as a new routine, starting `today` unless it says otherwise. */
export function newRoutineOf(patch: RoutinePatch, today: string): NewRoutine {
	return {
		...patch,
		title: patch.title!,
		priority: patch.priority ?? Priority.Medium,
		startTime: patch.startTime!,
		duration: patch.duration!,
		repeat: patch.repeat!,
		firstDay: patch.firstDay ?? today
	};
}
