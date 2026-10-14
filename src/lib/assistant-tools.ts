import { Priority } from '#lib/types.js';
import { addDays, isDateKey } from '#lib/time.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { TONE_LIMITS, TONE_NAMES, WAVES } from '#lib/tones.js';

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
export const DAY = 1440;

function fail(error: string): { ok: false; error: string } {
	return { ok: false, error };
}

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
	return {
		ok: true,
		value: { title, description, date: args.date, startTime, duration, priority }
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
	if (Object.keys(patch).length === 0) return fail('nothing to change');
	return { ok: true, value: { id: args.id, patch } };
}

export function parseDeleteTask(args: Args): Parsed<{ id: number }> {
	if (typeof args.id !== 'number' || !Number.isInteger(args.id))
		return fail('id must be a task id from list_tasks');
	return { ok: true, value: { id: args.id } };
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
			description: 'Add a task to the plan.',
			parameters: {
				type: 'object',
				properties: { ...taskProps, ...reasonProp },
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
						enum: ['none', 'daily', 'weekdays'],
						description: 'Repeating needs at, not in_minutes'
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

export const WRITE_TOOLS = ['add_task', 'update_task', 'delete_task'];
/** Tools that touch the schedule, not the plan. `set_alarm` puts something new in front of the user, so unprompted it needs autonomy act. */
export const SCHEDULE_TOOLS = ['schedule_wakeup', 'set_alarm', 'play_tone', 'cancel_schedule'];
export const ACT_ONLY_TOOLS = [...WRITE_TOOLS, 'set_alarm'];

/** The chat reads and edits the plan and the schedule, the user asked for it. */
export const TOOLS = pick('list_tasks', ...WRITE_TOOLS, ...SCHEDULE_TOOLS);

/** An unprompted reaction may talk and plan its own wakeups, and may edit or set alarms only when the user allowed it (autonomy act). */
export const reactionTools = (mayEdit: boolean) =>
	pick(
		'list_tasks',
		'say',
		'ask',
		'schedule_wakeup',
		'play_tone',
		'cancel_schedule',
		...(mayEdit ? ACT_ONLY_TOOLS : [])
	);
