import { Priority } from '#lib/types.js';
import { addDays, isDateKey } from '#lib/time.js';

/** What the model may ask for. Pure validation, the database work lives in `#lib/server/assistant`. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TaskFields {
	title: string;
	description: string;
	date: string;
	startTime: number;
	duration: number;
	priority: Priority;
}

export const MAX_LIST_DAYS = 14;
const DAY = 1440;

function fail(error: string): { ok: false; error: string } {
	return { ok: false, error };
}

/** Accepts `HH:MM` (what the model is told to send) or minutes since midnight. */
function parseTime(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DAY) return value;
	const match = typeof value === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
	return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

function parseDuration(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= DAY ? value : undefined;
}

function parsePriority(value: unknown): Priority | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? (value as Priority) : undefined;
}

function parseTitle(value: unknown): string | undefined {
	const title = typeof value === 'string' ? value.trim() : '';
	return title && title.length <= 200 ? title : undefined;
}

type Args = Record<string, unknown>;

export function parseListTasks(args: Args): Parsed<{ from: string; to: string }> {
	const { from, to = from } = args;
	if (!isDateKey(from) || !isDateKey(to)) return fail('from and to must be YYYY-MM-DD');
	if (to < from) return fail('to must not be before from');
	if (addDays(from, MAX_LIST_DAYS - 1) < to) return fail(`at most ${MAX_LIST_DAYS} days at once`);
	return { ok: true, value: { from, to } };
}

export function parseAddTask(args: Args): Parsed<TaskFields> {
	const title = parseTitle(args.title);
	const startTime = parseTime(args.start);
	const duration = parseDuration(args.duration_minutes ?? 30);
	const priority = parsePriority(args.priority ?? Priority.Medium);
	if (!title) return fail('title is required (max 200 characters)');
	if (!isDateKey(args.date)) return fail('date must be YYYY-MM-DD');
	if (startTime === undefined) return fail('start must be HH:MM');
	if (duration === undefined) return fail('duration_minutes must be a whole number from 5 to 1440');
	if (priority === undefined) return fail('priority must be 1 to 5');
	if (startTime + duration > DAY) return fail('tasks cannot cross midnight, split the task');
	const description = typeof args.description === 'string' ? args.description.slice(0, 1000) : '';
	return { ok: true, value: { title, description, date: args.date, startTime, duration, priority } };
}

export type TaskPatch = Partial<TaskFields> & { status?: 'pending' | 'completed' };

export function parseUpdateTask(args: Args): Parsed<{ id: number; patch: TaskPatch }> {
	if (typeof args.id !== 'number' || !Number.isInteger(args.id)) return fail('id must be a task id from list_tasks');
	const patch: TaskPatch = {};

	if (args.title !== undefined) {
		const title = parseTitle(args.title);
		if (!title) return fail('title must be 1 to 200 characters');
		patch.title = title;
	}
	if (args.description !== undefined) {
		if (typeof args.description !== 'string') return fail('description must be text');
		patch.description = args.description.slice(0, 1000);
	}
	if (args.date !== undefined) {
		if (!isDateKey(args.date)) return fail('date must be YYYY-MM-DD');
		patch.date = args.date;
	}
	if (args.start !== undefined) {
		const startTime = parseTime(args.start);
		if (startTime === undefined) return fail('start must be HH:MM');
		patch.startTime = startTime;
	}
	if (args.duration_minutes !== undefined) {
		const duration = parseDuration(args.duration_minutes);
		if (duration === undefined) return fail('duration_minutes must be a whole number from 5 to 1440');
		patch.duration = duration;
	}
	if (args.priority !== undefined) {
		const priority = parsePriority(args.priority);
		if (priority === undefined) return fail('priority must be 1 to 5');
		patch.priority = priority;
	}
	if (args.status !== undefined) {
		if (args.status !== 'pending' && args.status !== 'completed') return fail('status must be pending or completed');
		patch.status = args.status;
	}
	if (Object.keys(patch).length === 0) return fail('nothing to change');
	return { ok: true, value: { id: args.id, patch } };
}

export function parseDeleteTask(args: Args): Parsed<{ id: number }> {
	if (typeof args.id !== 'number' || !Number.isInteger(args.id)) return fail('id must be a task id from list_tasks');
	return { ok: true, value: { id: args.id } };
}

const taskProps = {
	title: { type: 'string' },
	description: { type: 'string' },
	date: { type: 'string', description: 'YYYY-MM-DD in the user timezone' },
	start: { type: 'string', description: '24 hour HH:MM' },
	duration_minutes: { type: 'integer', description: '5 to 1440, tasks must end before midnight' },
	priority: { type: 'integer', description: '1 low, 2 medium, 3 high, 4 urgent, 5 critical' }
};

const DEFINITIONS = [
	{
		type: 'function',
		function: {
			name: 'list_tasks',
			description: 'List the tasks of a date range, with their ids. Today and tomorrow are already in your context.',
			parameters: {
				type: 'object',
				properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: `YYYY-MM-DD, at most ${MAX_LIST_DAYS} days after from` } },
				required: ['from']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_task',
			description: 'Add a task to the plan.',
			parameters: { type: 'object', properties: taskProps, required: ['title', 'date', 'start'] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_task',
			description: 'Change a task: move, rename, resize, reprioritise, or mark done or pending. Only send the fields that change.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'integer' }, ...taskProps, status: { type: 'string', enum: ['pending', 'completed'] } },
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_task',
			description: 'Delete a task. Only when the user clearly wants it gone.',
			parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }
		}
	}
] as const;

/** Tool definitions in the Responses API format (flat, not nested under `function`). */
export const TOOLS = DEFINITIONS.map(({ function: fn }) => ({ type: 'function' as const, ...fn }));
