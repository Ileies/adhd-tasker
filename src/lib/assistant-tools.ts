import type { TaskKind } from '#lib/core/repo.js';
import { MAX_SHIFT } from '#lib/placeday.js';
import { Priority } from '#lib/types.js';
import { addDays, isDateKey } from '#lib/time.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { TONE_LIMITS, TONE_NAMES, WAVES } from '#lib/tones.js';

/** What the model may ask for. Pure validation, the database work lives in `#lib/server/assistant`. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const TASK_KINDS: readonly TaskKind[] = ['block', 'appointment', 'travel'];

export interface TaskFields {
	title: string;
	description: string;
	date: string;
	startTime: number;
	duration: number;
	priority: Priority;
	/** Only when the model sent it. */
	kind?: TaskKind;
	shift?: number;
	/** The appointment a travel task leads to. */
	parentId?: number | null;
}

export const MAX_LIST_DAYS = 14;
export const DAY = 1440;

function fail(error: string): { ok: false; error: string } {
	return { ok: false, error };
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Accepts `HH:MM` (what the model is told to send) or minutes since midnight. */
export function parseTime(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DAY)
		return value;
	const match =
		typeof value === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
	return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

export function parseDuration(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= DAY
		? value
		: undefined;
}

export function parsePriority(value: unknown): Priority | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
		? (value as Priority)
		: undefined;
}

export function parseTitle(value: unknown): string | undefined {
	const title = typeof value === 'string' ? value.trim() : '';
	return title && title.length <= 200 ? title : undefined;
}

type Args = Record<string, unknown>;

/** Strict mode makes the model send `null` for every optional field, the parsers below treat a missing field and `null` the same. */
function withoutNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withoutNulls);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, v]) => v !== null)
				.map(([k, v]) => [k, withoutNulls(v)])
		);
	}
	return value;
}

/** The arguments of a tool call as the parsers expect them, `undefined` when they are not a JSON object. */
export function parseToolArguments(raw: string | undefined): Args | undefined {
	try {
		const args = withoutNulls(JSON.parse(raw || '{}'));
		return args && typeof args === 'object' && !Array.isArray(args) ? (args as Args) : undefined;
	} catch {
		return undefined;
	}
}

export function parseListTasks(args: Args): Parsed<{ from: string; to: string }> {
	const { from, to = from } = args;
	if (!isDateKey(from) || !isDateKey(to)) return fail('from and to must be YYYY-MM-DD');
	if (to < from) return fail('to must not be before from');
	if (addDays(from, MAX_LIST_DAYS - 1) < to) return fail(`at most ${MAX_LIST_DAYS} days at once`);
	return { ok: true, value: { from, to } };
}

/** The kind, how far it may move and the appointment of a travel task, each only when it was sent. */
function parseKindFields(args: Args): Parsed<Pick<TaskFields, 'kind' | 'shift' | 'parentId'>> {
	const value: Pick<TaskFields, 'kind' | 'shift' | 'parentId'> = {};
	if (args.kind !== undefined) {
		if (!TASK_KINDS.includes(args.kind as TaskKind))
			return fail('kind must be block, appointment or travel');
		value.kind = args.kind as TaskKind;
	}
	if (args.shift !== undefined) {
		if (!isWhole(args.shift, 0, MAX_SHIFT))
			return fail(`shift must be whole minutes from 0 to ${MAX_SHIFT}`);
		value.shift = args.shift;
	}
	if (args.parent_id !== undefined) {
		if (!isWhole(args.parent_id, 1, Number.MAX_SAFE_INTEGER))
			return fail('parent_id must be the id of an appointment');
		value.parentId = args.parent_id;
	}
	return { ok: true, value };
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
	const kind = parseKindFields(args);
	if (!kind.ok) return kind;
	const description = typeof args.description === 'string' ? args.description.slice(0, 1000) : '';
	return {
		ok: true,
		value: {
			title,
			description,
			date: args.date,
			startTime,
			duration,
			priority,
			...kind.value
		}
	};
}

export type TaskPatch = Partial<TaskFields> & { status?: 'pending' | 'completed' };

export function parseUpdateTask(args: Args): Parsed<{ id: number; patch: TaskPatch }> {
	if (typeof args.id !== 'number' || !Number.isInteger(args.id))
		return fail('id must be a task id from list_tasks');
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
		if (duration === undefined)
			return fail('duration_minutes must be a whole number from 5 to 1440');
		patch.duration = duration;
	}
	if (args.priority !== undefined) {
		const priority = parsePriority(args.priority);
		if (priority === undefined) return fail('priority must be 1 to 5');
		patch.priority = priority;
	}
	if (args.status !== undefined) {
		if (args.status !== 'pending' && args.status !== 'completed')
			return fail('status must be pending or completed');
		patch.status = args.status;
	}
	const kind = parseKindFields(args);
	if (!kind.ok) return kind;
	Object.assign(patch, kind.value);
	if (Object.keys(patch).length === 0) return fail('nothing to change');
	return { ok: true, value: { id: args.id, patch } };
}

export function parseDeleteTask(args: Args): Parsed<{ id: number }> {
	if (typeof args.id !== 'number' || !Number.isInteger(args.id))
		return fail('id must be a task id from list_tasks');
	return { ok: true, value: { id: args.id } };
}

/** A tool's snake_case fields as the body the screens send, so the rules of `/todos` and `/routines` are the only ones. */
type Renames = Record<string, string>;

/**
 * Copies the fields the model sent under the names the core rules know. `clear` lists fields to empty: a `null` cannot
 * come through strict mode (it means "not sent"), so emptying a field has its own word. The core validates the values.
 */
function bodyOf(
	args: Args,
	renames: Renames,
	clearable: Record<string, string[]>
): Parsed<Record<string, unknown>> {
	const body: Record<string, unknown> = {};
	for (const [field, name] of Object.entries(renames))
		if (args[field] !== undefined) body[name] = args[field];
	// The clock the model sends is HH:MM, the rules count minutes since midnight
	for (const field of ['start', 'due_time']) {
		if (args[field] === undefined || !(field in renames)) continue;
		const minutes = parseTime(args[field]);
		if (minutes === undefined) return fail(`${field} must be HH:MM`);
		body[renames[field]] = minutes;
	}
	if (args.clear !== undefined) {
		if (!Array.isArray(args.clear) || args.clear.some((word) => !(word in clearable)))
			return fail(`clear is a list of: ${Object.keys(clearable).join(', ')}`);
		for (const word of args.clear as string[])
			for (const name of clearable[word]) body[name] = null;
	}
	return { ok: true, value: body };
}

const TODO_RENAMES: Renames = {
	title: 'title',
	description: 'description',
	priority: 'priority',
	estimate_minutes: 'estimate',
	due_date: 'dueDate',
	due_time: 'dueTime',
	not_before: 'notBefore',
	next_step: 'nextStep',
	parent_id: 'parentId',
	status: 'status'
};
export const TODO_CLEARABLE: Record<string, string[]> = {
	estimate: ['estimate'],
	due: ['dueDate', 'dueTime'],
	not_before: ['notBefore'],
	next_step: ['nextStep']
};

/** The body of `add_todo`, validated by `parseTodoInput` when it is stored. */
export const parseAddTodo = (args: Args) =>
	bodyOf({ ...args, clear: undefined }, TODO_RENAMES, TODO_CLEARABLE);

/** The body of `update_todo` with its id. The progress is never in it: only the user knows how far they are. */
export function parseUpdateTodo(args: Args): Parsed<Record<string, unknown>> {
	if (!isWhole(args.id, 1, Number.MAX_SAFE_INTEGER))
		return fail('id must be a to-do id from list_todos');
	const body = bodyOf(args, TODO_RENAMES, TODO_CLEARABLE);
	return body.ok ? { ok: true, value: { ...body.value, id: args.id } } : body;
}

const ROUTINE_RENAMES: Renames = {
	title: 'title',
	description: 'description',
	priority: 'priority',
	start: 'startTime',
	duration_minutes: 'duration',
	shift: 'shift',
	kind: 'kind',
	repeat: 'repeat',
	first_day: 'firstDay',
	last_day: 'lastDay'
};
export const ROUTINE_CLEARABLE: Record<string, string[]> = { last_day: ['lastDay'] };

/** The body of `add_routine`, validated by `parseRoutineInput` when it is stored. */
export const parseAddRoutine = (args: Args) =>
	bodyOf({ ...args, clear: undefined }, ROUTINE_RENAMES, ROUTINE_CLEARABLE);

export function parseUpdateRoutine(args: Args): Parsed<Record<string, unknown>> {
	if (!isWhole(args.id, 1, Number.MAX_SAFE_INTEGER))
		return fail('id must be a routine id from list_routines');
	const body = bodyOf(args, ROUTINE_RENAMES, ROUTINE_CLEARABLE);
	return body.ok ? { ok: true, value: { ...body.value, id: args.id } } : body;
}

/** Steps that prepare for an appointment: few, small, in the order to do them. */
export const PREP_STEP_LIMITS = { maxSteps: 6, minMinutes: 5, maxMinutes: 600 } as const;

export interface PrepStep {
	title: string;
	/** The model's honest guess in minutes, `null` when it has none. */
	minutes: number | null;
}

/** The steps a model suggests for an appointment, `steps` as sent by `suggest_steps` and `add_prep_steps`. */
export function parsePrepSteps(raw: unknown): Parsed<PrepStep[]> {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > PREP_STEP_LIMITS.maxSteps)
		return fail(`steps is a list of 1 to ${PREP_STEP_LIMITS.maxSteps} steps`);
	const steps: PrepStep[] = [];
	for (const item of raw) {
		const step = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
		const title = parseTitle(step.title);
		if (!title) return fail('every step needs a title of at most 200 characters');
		const minutes = step.minutes ?? null;
		if (
			minutes !== null &&
			!isWhole(minutes, PREP_STEP_LIMITS.minMinutes, PREP_STEP_LIMITS.maxMinutes)
		)
			return fail(
				`minutes is a whole number from ${PREP_STEP_LIMITS.minMinutes} to ${PREP_STEP_LIMITS.maxMinutes}, or left out`
			);
		steps.push({ title, minutes });
	}
	return { ok: true, value: steps };
}

/** `add_prep_steps`: the appointment and the steps that prepare for it. */
export function parseAddPrepSteps(
	args: Args
): Parsed<{ appointmentId: number; steps: PrepStep[] }> {
	if (!isWhole(args.appointment_id, 1, Number.MAX_SAFE_INTEGER))
		return fail('appointment_id must be the id of an appointment from list_tasks');
	const steps = parsePrepSteps(args.steps);
	return steps.ok
		? { ok: true, value: { appointmentId: args.appointment_id, steps: steps.value } }
		: steps;
}

/** The id of a to-do or a routine to delete. */
export function parseDeleteById(args: Args, what: 'todo' | 'routine'): Parsed<{ id: number }> {
	return isWhole(args.id, 1, Number.MAX_SAFE_INTEGER)
		? { ok: true, value: { id: args.id } }
		: fail(`id must be a ${what} id from list_${what}s`);
}

export const MAX_SAY = 200;
export const MAX_OPTIONS = 3;
export const MAX_OPTION = 40;

/** Why the agent made a change, shown in the activity log. Optional, never fails a change. */
export function parseReason(value: unknown): string | null {
	const reason = typeof value === 'string' ? value.trim().slice(0, 200) : '';
	return reason || null;
}

export function parseSay(args: Args): Parsed<{ text: string }> {
	const text = typeof args.text === 'string' ? args.text.trim() : '';
	if (!text) return fail('text is required');
	if (text.length > MAX_SAY) return fail(`text must be at most ${MAX_SAY} characters, shorten it`);
	return { ok: true, value: { text } };
}

export function parseAsk(args: Args): Parsed<{ text: string; options: string[] }> {
	const said = parseSay(args);
	if (!said.ok) return said;
	const raw = args.options === undefined ? [] : args.options;
	if (!Array.isArray(raw) || raw.length > MAX_OPTIONS)
		return fail(`options is a list of at most ${MAX_OPTIONS} short answers`);
	const options = raw.map((option) => (typeof option === 'string' ? option.trim() : ''));
	if (options.some((option) => !option || option.length > MAX_OPTION))
		return fail(`each option must be 1 to ${MAX_OPTION} characters`);
	return { ok: true, value: { text: said.value.text, options } };
}

const reasonProp = {
	reason: {
		type: 'string',
		description:
			'Why you are making this change, one short sentence. The user reads it in the activity log.'
	}
};

const taskProps = {
	title: { type: 'string' },
	description: { type: 'string' },
	date: { type: 'string', description: 'YYYY-MM-DD in the user timezone' },
	start: { type: 'string', description: '24 hour HH:MM' },
	duration_minutes: { type: 'integer', description: '5 to 1440, tasks must end before midnight' },
	priority: { type: 'integer', description: '1 low, 2 medium, 3 high, 4 urgent, 5 critical' }
};

const kindProps = {
	kind: {
		type: 'string',
		enum: [...TASK_KINDS],
		description:
			'block (the default): time of the user own. appointment: somebody else time, such as a meeting or an exam, it ends on its own. travel: getting to an appointment, needs parent_id'
	},
	shift: {
		type: 'integer',
		description: `Minutes a block may move to make room for an appointment, 0 stays (the default), at most ${MAX_SHIFT}. Meals may move, meds and bed stay`
	},
	parent_id: {
		type: 'integer',
		description: 'Only for travel: the id of the appointment it leads to, on the same day'
	}
};

const todoProps = {
	title: { type: 'string' },
	description: { type: 'string' },
	priority: { type: 'integer', description: '1 low, 2 medium, 3 high, 4 urgent, 5 critical' },
	estimate_minutes: {
		type: 'integer',
		description: 'How long the whole thing takes in minutes, 1 to 30000. Leave out when unknown'
	},
	due_date: { type: 'string', description: 'YYYY-MM-DD in the user timezone' },
	due_time: {
		type: 'string',
		description: '24 hour HH:MM, only with due_date. Without it the end of My day'
	},
	not_before: { type: 'string', description: 'YYYY-MM-DD: not picked before this day' },
	next_step: {
		type: 'string',
		description: 'One small first step, at most 200 characters, shown on the to-do'
	},
	parent_id: {
		type: 'integer',
		description: 'The id of the appointment this to-do prepares for'
	}
};

const routineProps = {
	title: { type: 'string' },
	description: { type: 'string' },
	priority: { type: 'integer', description: '1 low, 2 medium, 3 high, 4 urgent, 5 critical' },
	start: { type: 'string', description: '24 hour HH:MM' },
	duration_minutes: { type: 'integer', description: '5 to 1440, must end before midnight' },
	shift: kindProps.shift,
	kind: {
		type: 'string',
		enum: ['block', 'appointment'],
		description: 'block (the default) or appointment'
	},
	repeat: {
		type: 'string',
		description:
			'daily, weekdays (Monday to Friday) or days:1,3 for chosen weekdays (0 Sunday to 6 Saturday, ascending)'
	},
	first_day: {
		type: 'string',
		description: 'YYYY-MM-DD, the first day it has. Today when left out'
	},
	last_day: {
		type: 'string',
		description: 'YYYY-MM-DD, the last day it has. Goes on when left out'
	}
};

const stepsProp = {
	type: 'array',
	description: `1 to ${PREP_STEP_LIMITS.maxSteps} concrete steps in the order to do them. A title is a short verb phrase, such as Pack ID and pens. minutes is your honest guess for the step, or null`,
	items: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			minutes: {
				type: ['integer', 'null'],
				description: `${PREP_STEP_LIMITS.minMinutes} to ${PREP_STEP_LIMITS.maxMinutes}`
			}
		},
		required: ['title', 'minutes'],
		additionalProperties: false
	}
};

const whenProps = {
	in_minutes: { type: 'integer', description: 'Minutes from now' },
	at: { type: 'string', description: '24 hour HH:MM, today if still ahead, else tomorrow' },
	date: { type: 'string', description: 'YYYY-MM-DD, only together with at' }
};

const toneProp = {
	description: `A library name (${TONE_NAMES.join(', ')}) or a custom tone: { wave, notes: [{ hz, ms, rest }] } with at most ${TONE_LIMITS.maxNotes} notes, ${TONE_LIMITS.minHz} to ${TONE_LIMITS.maxHz} Hz, ${TONE_LIMITS.minNoteMs} to ${TONE_LIMITS.maxNoteMs} ms per note, rest (silence after the note in ms, or null) and ${TONE_LIMITS.maxMs / 1000} seconds in total. Custom tones are limited to ${TONE_LIMITS.customPerDay} per day, prefer a name.`,
	anyOf: [
		{ type: 'string', enum: [...TONE_NAMES] },
		{
			type: 'object',
			properties: {
				wave: { type: 'string', enum: [...WAVES] },
				notes: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							hz: { type: 'number' },
							ms: { type: 'number' },
							rest: { type: ['number', 'null'] }
						},
						required: ['hz', 'ms', 'rest'],
						additionalProperties: false
					}
				}
			},
			required: ['wave', 'notes'],
			additionalProperties: false
		}
	]
};

const DEFINITIONS = [
	{
		type: 'function',
		function: {
			name: 'list_tasks',
			description:
				'List the tasks of a date range, with their ids. Today and tomorrow are already in your context.',
			parameters: {
				type: 'object',
				properties: {
					from: { type: 'string', description: 'YYYY-MM-DD' },
					to: {
						type: 'string',
						description: `YYYY-MM-DD, at most ${MAX_LIST_DAYS} days after from`
					}
				},
				required: ['from']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_task',
			description:
				'Add a task at a time to the plan. Something without a time is a to-do, use add_todo. Something that repeats is a routine, use add_routine.',
			parameters: {
				type: 'object',
				properties: { ...taskProps, ...kindProps, ...reasonProp },
				required: ['title', 'date', 'start']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_task',
			description:
				'Change a task: move, rename, resize, reprioritise, or mark done or pending. Only send the fields that change.',
			parameters: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					...taskProps,
					...kindProps,
					status: { type: 'string', enum: ['pending', 'completed'] },
					...reasonProp
				},
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_task',
			description: 'Delete a task. Only when the user clearly wants it gone.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'integer' }, ...reasonProp },
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_todos',
			description:
				'List the open to-dos with their ids, sizes, due dates and progress. The open to-dos are already in your context.',
			parameters: { type: 'object', properties: {}, required: [] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_todo',
			description:
				'Add a to-do: work without a time. The app decides when it gets minutes, you never place it. Add the size (estimate_minutes) and the due date when you know them.',
			parameters: {
				type: 'object',
				properties: { ...todoProps, ...reasonProp },
				required: ['title']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_todo',
			description:
				'Change a to-do: rename, resize, move its due date, reprioritise, give it a next step, or mark it done, dropped or open again. Only send the fields that change. You cannot set the progress, only the user knows how far they are.',
			parameters: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					...todoProps,
					status: { type: 'string', enum: ['open', 'done', 'dropped'] },
					clear: {
						type: 'array',
						items: { type: 'string', enum: Object.keys(TODO_CLEARABLE) },
						description: 'Fields to empty, for example due to remove the due date and time'
					},
					...reasonProp
				},
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_todo',
			description: 'Delete a to-do. Only when the user clearly wants it gone.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'integer' }, ...reasonProp },
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_routines',
			description:
				'List the routines (tasks at a time that repeat) with their ids. They are already in your context.',
			parameters: { type: 'object', properties: {}, required: [] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_routine',
			description:
				'Add a routine: a task at a time that repeats, such as meds every morning. It makes its tasks for the next 14 days.',
			parameters: {
				type: 'object',
				properties: { ...routineProps, ...reasonProp },
				required: ['title', 'start', 'duration_minutes', 'repeat']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_routine',
			description:
				'Change a routine. Its days from today on follow, a day the user changed or finished keeps its changes. Meds, meals, sleep and water are the floor of the day: never move them far, shorten them or turn them off unless the user clearly asks, and ask first when a plan would need it.',
			parameters: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					...routineProps,
					clear: {
						type: 'array',
						items: { type: 'string', enum: Object.keys(ROUTINE_CLEARABLE) },
						description: 'Fields to empty, last_day to let it go on'
					},
					...reasonProp
				},
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_routine',
			description:
				'Delete a routine and its days from today on. Only when the user clearly wants it gone. Never for meds, meals or bed unless they ask for exactly that.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'integer' }, ...reasonProp },
				required: ['id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_prep_steps',
			description:
				'Add the steps that prepare for an appointment as to-dos. Each is due when the travel to the appointment starts (the appointment itself without travel), so you never compute a date. Use this instead of add_todo for preparation.',
			parameters: {
				type: 'object',
				properties: {
					appointment_id: { type: 'integer', description: 'The id of the appointment' },
					steps: stepsProp,
					...reasonProp
				},
				required: ['appointment_id', 'steps']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'suggest_steps',
			description:
				'Answer with the steps that prepare for the appointment. Nothing is written, the user reads them first.',
			parameters: { type: 'object', properties: { steps: stepsProp }, required: ['steps'] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'say',
			description: `Show the user one short note on the Now screen, at most ${MAX_SAY} characters. Only when it really helps, once per reaction.`,
			parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'ask',
			description: `Show the user one short question with up to ${MAX_OPTIONS} short answers (each at most ${MAX_OPTION} characters). The chosen answer comes back to you as a chat message.`,
			parameters: {
				type: 'object',
				properties: {
					text: { type: 'string' },
					options: {
						type: 'array',
						items: { type: 'string' },
						description: 'Short answers, for example Yes, Not now'
					}
				},
				required: ['text']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'schedule_wakeup',
			description: `Wake yourself up later with a note to yourself, for example to check whether the user finished something. The note is handed back to you when it fires. At least ${SCHEDULE_LIMITS.minWakeupMinutes} minutes ahead, at most ${SCHEDULE_LIMITS.maxWakeups} pending, not in quiet hours. Give in_minutes, or at (HH:MM).`,
			parameters: {
				type: 'object',
				properties: {
					...whenProps,
					note: {
						type: 'string',
						description: `What to check or do when you wake up, at most ${SCHEDULE_LIMITS.maxNote} characters`
					}
				},
				required: ['note']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'set_alarm',
			description:
				'Set an alarm the user sees and hears on the Now screen, listed in their alarm list where they can cancel it. Give in_minutes, or at (HH:MM, optionally date). Only when it clearly helps, such as a leave now alarm.',
			parameters: {
				type: 'object',
				properties: {
					...whenProps,
					label: {
						type: 'string',
						description: `Shown while it rings, at most ${SCHEDULE_LIMITS.maxLabel} characters`
					},
					tone: toneProp,
					repeat: {
						type: 'string',
						description:
							'none, daily, weekdays (Monday to Friday) or days:1,3,6 for chosen weekdays (0 Sunday to 6 Saturday, ascending, for example days:3,4,5 for Wednesday to Friday). Repeating needs at, not in_minutes'
					},
					duration_minutes: {
						type: 'integer',
						description: `How long it keeps ringing, default ${SCHEDULE_LIMITS.defaultAlarmMinutes}, at most ${SCHEDULE_LIMITS.maxAlarmMinutes}`
					}
				},
				required: ['label']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'play_tone',
			description:
				'Play a tone on the screen the user uses for sound, right now. Use rarely, a tone interrupts.',
			parameters: { type: 'object', properties: { tone: toneProp }, required: ['tone'] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'cancel_schedule',
			description: 'Cancel a pending alarm or wakeup by its id from the schedule list.',
			parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }
		}
	}
] as const;

export interface Tool {
	type: 'function';
	name: string;
	description: string;
	parameters: object;
	strict: true;
}

type Schema = Record<string, unknown>;

/** In strict mode an optional field stays in `required` and is allowed to be `null` instead. */
function nullable(schema: Schema): Schema {
	if (Array.isArray(schema.anyOf)) return { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] };
	const type = [schema.type, 'null'].flat();
	return Array.isArray(schema.enum)
		? { ...schema, type, enum: [...schema.enum, null] }
		: { ...schema, type };
}

/** Strict mode rules: every property is required, optional ones are nullable, no extra properties. */
function strictParameters(parameters: { properties: Schema; required: readonly string[] }) {
	const properties = Object.fromEntries(
		Object.entries(parameters.properties).map(([key, schema]) => [
			key,
			parameters.required.includes(key) ? schema : nullable(schema as Schema)
		])
	);
	return {
		type: 'object',
		properties,
		required: Object.keys(properties),
		additionalProperties: false
	};
}

/** Tool definitions in the Responses API format (flat, not nested under `function`) with strict mode on, as OpenAI recommends. */
const ALL_TOOLS: Tool[] = DEFINITIONS.map(({ function: fn }) => ({
	type: 'function' as const,
	name: fn.name,
	description: fn.description,
	parameters: strictParameters(fn.parameters),
	strict: true as const
}));
const pick = (...names: string[]) => ALL_TOOLS.filter((tool) => names.includes(tool.name));

export const TASK_WRITE_TOOLS = ['add_task', 'update_task', 'delete_task'];
export const TODO_WRITE_TOOLS = ['add_todo', 'update_todo', 'delete_todo', 'add_prep_steps'];
/** A routine changes fourteen days at once, so only the chat edits one, never an unprompted reaction. */
export const ROUTINE_WRITE_TOOLS = ['add_routine', 'update_routine', 'delete_routine'];
export const WRITE_TOOLS = [...TASK_WRITE_TOOLS, ...TODO_WRITE_TOOLS, ...ROUTINE_WRITE_TOOLS];
export const READ_TOOLS = ['list_tasks', 'list_todos', 'list_routines'];
/** Tools that touch the schedule, not the plan. `set_alarm` puts something new in front of the user, so unprompted it needs autonomy act. */
export const SCHEDULE_TOOLS = ['schedule_wakeup', 'set_alarm', 'play_tone', 'cancel_schedule'];
export const ACT_ONLY_TOOLS = [...TASK_WRITE_TOOLS, ...TODO_WRITE_TOOLS, 'set_alarm'];

/** The one tool of the `prep` use: it answers with steps and writes nothing. */
export const PREP_TOOLS = pick('suggest_steps');
export const PREP_TOOL_NAME = 'suggest_steps';

/** The chat reads and edits the plan and the schedule, the user asked for it. */
export const TOOLS = pick(...READ_TOOLS, ...WRITE_TOOLS, ...SCHEDULE_TOOLS);

/** An unprompted reaction may talk and plan its own wakeups, and may edit or set alarms only when the user allowed it (autonomy act). */
export const reactionTools = (mayEdit: boolean) =>
	pick(
		...READ_TOOLS,
		'say',
		'ask',
		'schedule_wakeup',
		'play_tone',
		'cancel_schedule',
		...(mayEdit ? ACT_ONLY_TOOLS : [])
	);
