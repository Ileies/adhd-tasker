/**
 * The file a user can take with them: the plan, the alarms and the settings that are theirs to choose, as
 * one JSON document with a format version. A guest exports from the device, an account from the server, and the same
 * file moves a guest's plan into an account (local first plan 5.3). It never holds the OpenAI key, the
 * assistant's log or anything that belongs to one machine (display device, linked Google services).
 */
import { MAX_SHIFT } from '#lib/placeday.js';
import type {
	FlowRow,
	FlowType,
	NewRoutine,
	NewTask,
	NewTodo,
	Repo,
	Routine,
	ScheduleEntry,
	Settings,
	Task,
	TaskKind,
	Todo,
	TodoStatus
} from '#lib/core/repo.js';
import { MAX_ROUTINES, parseRoutineInput } from '#lib/routine-input.js';
import { SCHEDULE_LIMITS, parseRepeat, type Repeat } from '#lib/schedule.js';
import { parseSettingsPatch, type SettingsPatch } from '#lib/settings.js';
import { isDateKey, isValidTimezone } from '#lib/time.js';
import { parseTaskInput } from '#lib/task-input.js';
import { parseTodoInput } from '#lib/todo-input.js';
import { readTone, type Tone } from '#lib/tones.js';
import { Priority, TaskStatus } from '#lib/types.js';

export const EXPORT_APP = 'adhd-tasker';
/** 2: `completedAt` on tasks, to-dos and the flow log. A version 1 file still imports. */
export const EXPORT_VERSION = 2;

/** Bounds on what an import accepts, so a wrong file cannot fill the device. */
export const EXPORT_LIMITS = {
	tasks: 20_000,
	todos: 20_000,
	routines: MAX_ROUTINES,
	alarms: SCHEDULE_LIMITS.maxAlarms
} as const;

export type ExportedTask = Omit<
	Required<NewTask>,
	'completedAt' | 'kind' | 'parentId' | 'shift' | 'routineId'
> & {
	/** The routine that made the task, an index into the file's routine list. A file from before routines has none. */
	routine?: number | null;
	/** How far the task may move for an appointment. A file from before that has none: it stays. */
	shift?: number;
	/** Epoch ms of Done. A file from version 1 has none. */
	completedAt?: number | null;
	/** A file from before appointments has none: every task is a block. */
	kind?: TaskKind;
	/** The appointment a travel task leads to, an index into the file's task list. */
	parent?: number | null;
};

/** A routine as the file holds it. `through` keeps the days that were made, so a day the user deleted stays gone. */
type ExportedRoutine = Required<NewRoutine>;

/** A to-do as the file holds it. `parent` is an index into the file's task list (the appointment it prepares for). */
interface ExportedTodo extends Omit<Required<NewTodo>, 'parentId' | 'createdAt'> {
	parent: number | null;
	createdAt: number;
}

/**
 * What the user answered today and before, for them to read. It is never imported: a session in progress
 * starts again after a move. Links are indexes into the file's lists.
 */
interface ExportedFlow {
	at: number;
	date: string;
	type: FlowType;
	todo: number | null;
	task: number | null;
	data: Record<string, unknown>;
}

interface ExportedAlarm {
	fireAt: number;
	minutes: number | null;
	repeat: Repeat;
	label: string;
	tone: Tone;
	durationMin: number;
	enabled?: boolean;
}

export interface ExportFile {
	app: typeof EXPORT_APP;
	version: typeof EXPORT_VERSION;
	exportedAt: number;
	settings: SettingsPatch & { timezone?: string };
	tasks: ExportedTask[];
	todos: ExportedTodo[];
	routines: ExportedRoutine[];
	alarms: ExportedAlarm[];
	flow: ExportedFlow[];
}

/** The settings a user chose, by the names the settings validator knows. */
const SETTING_KEYS = [
	'enableReminders',
	'reminderAdvanceTime',
	'hyperfocusAlarm',
	'overrunMinutes',
	'aiAutonomy',
	'aiEvents',
	'quietStart',
	'quietEnd',
	'dailyTokenBudget',
	'voiceReplies',
	'openaiTranscribe',
	'voiceLanguage',
	'showClock',
	'clock12h',
	'checkInMinutes',
	'myDayStart',
	'myDayEnd',
	'checkMinutes',
	'breakMinutes',
	'arriveEarlyMinutes',
	'startWorkAt'
] as const satisfies readonly (keyof SettingsPatch)[];

export const FIRST_DAY = '0000-01-01';

/**
 * The file for rows that are already read: the plan, the pending alarms (the assistant's wakeups are not
 * exported) and the settings the user chose. Pure, so the server can build it inside a transaction.
 */
export function assembleExport(rows: {
	settings: Settings;
	tasks: Task[];
	/** Left out, an export has none. */
	todos?: Todo[];
	/** Left out, an export has none. */
	routines?: Routine[];
	schedule: ScheduleEntry[];
	/** Left out, the file has no flow log (a move leaves it behind). */
	flow?: FlowRow[];
	now: number;
}): ExportFile {
	const settings: ExportFile['settings'] = {};
	for (const key of SETTING_KEYS) Object.assign(settings, { [key]: rows.settings[key] });
	if (rows.settings.timezone) settings.timezone = rows.settings.timezone;

	const todos = rows.todos ?? [];
	const routines = rows.routines ?? [];
	const routineIndex = (id: number | null) => {
		const index = id === null ? -1 : routines.findIndex((routine) => routine.id === id);
		return index < 0 ? null : index;
	};
	const taskIndex = (id: number | null) => {
		const index = id === null ? -1 : rows.tasks.findIndex((task) => task.id === id);
		return index < 0 ? null : index;
	};
	const todoIndex = (id: number | null) => {
		const index = id === null ? -1 : todos.findIndex((todo) => todo.id === id);
		return index < 0 ? null : index;
	};

	return {
		app: EXPORT_APP,
		version: EXPORT_VERSION,
		exportedAt: rows.now,
		settings,
		tasks: rows.tasks.map((task) => ({
			title: task.title,
			description: task.description,
			date: task.date,
			startTime: task.startTime,
			duration: task.duration,
			priority: task.priority,
			status: task.status,
			completedAt: task.completedAt,
			kind: task.kind,
			parent: taskIndex(task.parentId),
			shift: task.shift,
			routine: routineIndex(task.routineId)
		})),
		routines: routines.map((routine) => ({
			title: routine.title,
			description: routine.description,
			priority: routine.priority,
			startTime: routine.startTime,
			duration: routine.duration,
			shift: routine.shift,
			kind: routine.kind,
			repeat: routine.repeat,
			firstDay: routine.firstDay,
			lastDay: routine.lastDay,
			through: routine.through
		})),
		todos: todos.map((todo) => ({
			title: todo.title,
			description: todo.description,
			priority: todo.priority,
			status: todo.status,
			estimate: todo.estimate,
			learned: todo.learned,
			progress: todo.progress,
			spentMinutes: todo.spentMinutes,
			skips: todo.skips,
			skipSince: todo.skipSince,
			dueDate: todo.dueDate,
			dueTime: todo.dueTime,
			parent: taskIndex(todo.parentId),
			notBefore: todo.notBefore,
			nextStep: todo.nextStep,
			createdAt: todo.createdAt,
			completedAt: todo.completedAt
		})),
		alarms: rows.schedule
			.filter((entry) => entry.kind === 'alarm')
			.map((entry) => ({
				fireAt: entry.fireAt,
				minutes: entry.minutes,
				repeat: entry.repeat,
				label: entry.label ?? '',
				tone: readTone(entry.tone),
				durationMin: entry.durationMin,
				enabled: entry.enabled
			})),
		flow: (rows.flow ?? []).map((row) => ({
			at: row.at,
			date: row.date,
			type: row.type,
			todo: todoIndex(row.todoId),
			task: taskIndex(row.taskId),
			data: row.data
		}))
	};
}

export async function buildExport(repo: Repo, now: number): Promise<ExportFile> {
	return assembleExport({
		settings: await repo.settings.get(),
		tasks: await repo.tasks.between(FIRST_DAY),
		todos: await repo.todos.all(),
		routines: await repo.routines.all(),
		schedule: await repo.schedule.pending(),
		flow: await repo.flow.all(),
		now
	});
}

type Parsed = { ok: true; value: ExportFile } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function parseAlarmEntry(raw: unknown): ExportedAlarm | null {
	if (!isRecord(raw)) return null;
	const { fireAt, minutes, repeat, label, durationMin } = raw;
	if (typeof fireAt !== 'number' || !Number.isInteger(fireAt) || fireAt < 0) return null;
	if (
		minutes !== null &&
		(typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes > 1439)
	)
		return null;
	const parsedRepeat = parseRepeat(repeat);
	if (parsedRepeat === null) return null;
	if (typeof label !== 'string' || !label.trim() || label.length > SCHEDULE_LIMITS.maxLabel)
		return null;
	if (
		typeof durationMin !== 'number' ||
		!Number.isInteger(durationMin) ||
		durationMin < 1 ||
		durationMin > SCHEDULE_LIMITS.maxAlarmMinutes
	)
		return null;
	if (parsedRepeat !== 'none' && minutes === null) return null;
	return {
		fireAt,
		minutes,
		repeat: parsedRepeat,
		label: label.trim(),
		tone: readTone(raw.tone),
		durationMin,
		// A file from before the switch has no `enabled`: those alarms were on
		enabled: raw.enabled !== false
	};
}

/** An epoch ms moment from a file, `null` for anything else. */
const readMoment = (value: unknown): number | null =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const TASK_KINDS: readonly TaskKind[] = ['block', 'appointment', 'travel'];

/** A file from before appointments has no kind: its tasks are the user's own. */
const readKind = (item: unknown): TaskKind =>
	isRecord(item) && TASK_KINDS.includes(item.kind as TaskKind) ? (item.kind as TaskKind) : 'block';

/** How far a task may move. Anything that is not a whole number of minutes in range means it stays. */
const readShift = (item: unknown): number => {
	const shift = isRecord(item) ? item.shift : 0;
	return typeof shift === 'number' && Number.isInteger(shift) && shift >= 0 && shift <= MAX_SHIFT
		? shift
		: 0;
};

/** The appointment a travel task leads to, an index into the file's tasks. Anything else is no parent. */
const readParent = (item: unknown, taskCount: number): number | null => {
	const parent = isRecord(item) ? item.parent : null;
	return typeof parent === 'number' && Number.isInteger(parent) && parent >= 0 && parent < taskCount
		? parent
		: null;
};

/** The routine a task came from, an index into the file's routines. Anything else is a task of its own. */
const readRoutine = (item: unknown, routineCount: number): number | null => {
	const routine = isRecord(item) ? item.routine : null;
	return typeof routine === 'number' &&
		Number.isInteger(routine) &&
		routine >= 0 &&
		routine < routineCount
		? routine
		: null;
};

/** One routine of a file, or the reason it is not valid. The user's fields go through the same rules as the screens. */
function parseRoutineEntry(raw: unknown): ExportedRoutine | string {
	if (!isRecord(raw)) return 'not an object';
	if (raw.firstDay === undefined) return 'firstDay is missing';
	const parsed = parseRoutineInput(raw, 'create');
	if (!parsed.ok) return parsed.error;
	const routine = parsed.value;
	return {
		title: routine.title!,
		description: routine.description ?? '',
		priority: routine.priority ?? Priority.Medium,
		startTime: routine.startTime!,
		duration: routine.duration!,
		shift: routine.shift ?? 0,
		kind: routine.kind ?? 'block',
		repeat: routine.repeat!,
		firstDay: routine.firstDay!,
		lastDay: routine.lastDay ?? null,
		through: isDateKey(raw.through) ? raw.through : null
	};
}

const TODO_STATUSES: readonly TodoStatus[] = ['open', 'done', 'dropped', 'ended'];

/** One to-do of a file, or the reason it is not valid. The user's fields go through the same rules as the screens. */
function parseTodoEntry(raw: unknown, taskCount: number): ExportedTodo | string {
	if (!isRecord(raw)) return 'not an object';
	const parsed = parseTodoInput({ ...raw, status: undefined }, 'create');
	if (!parsed.ok) return parsed.error;
	const todo = parsed.value;

	const whole = (value: unknown, fallback: number, max: number) =>
		typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
			? value
			: fallback;
	const parent = raw.parent;
	if (
		parent !== null &&
		parent !== undefined &&
		(typeof parent !== 'number' || !Number.isInteger(parent) || parent < 0 || parent >= taskCount)
	)
		return 'its appointment is not in the file';

	return {
		title: todo.title!,
		description: todo.description ?? '',
		priority: todo.priority ?? Priority.Medium,
		status: TODO_STATUSES.includes(raw.status as TodoStatus) ? (raw.status as TodoStatus) : 'open',
		estimate: todo.estimate ?? null,
		learned: todo.estimate != null && raw.learned === true,
		progress: todo.progress ?? 0,
		spentMinutes: whole(raw.spentMinutes, 0, 1_000_000),
		skips: whole(raw.skips, 0, 1000),
		skipSince:
			typeof raw.skipSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.skipSince)
				? raw.skipSince
				: null,
		dueDate: todo.dueDate ?? null,
		dueTime: todo.dueTime ?? null,
		parent: typeof parent === 'number' ? parent : null,
		notBefore: todo.notBefore ?? null,
		nextStep: todo.nextStep ?? null,
		createdAt: readMoment(raw.createdAt) ?? 0,
		completedAt: readMoment(raw.completedAt)
	};
}

/** Reads what came from a file or from the server. Anything that is not a valid export is refused with the reason. */
export function parseExport(raw: unknown): Parsed {
	if (!isRecord(raw) || raw.app !== EXPORT_APP)
		return fail('This is not an ADHD Tasker export file');
	if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1)
		return fail('This export file has no valid version');
	if (raw.version > EXPORT_VERSION)
		return fail('This file comes from a newer version of the app, update the app first');

	if (!Array.isArray(raw.tasks) || raw.tasks.length > EXPORT_LIMITS.tasks)
		return fail(`The file needs a list of at most ${EXPORT_LIMITS.tasks} tasks`);
	// A file from before routines has none
	const routineList = raw.routines ?? [];
	if (!Array.isArray(routineList) || routineList.length > EXPORT_LIMITS.routines)
		return fail(`The file needs a list of at most ${EXPORT_LIMITS.routines} routines`);
	const routines: ExportedRoutine[] = [];
	for (const [index, item] of routineList.entries()) {
		const routine = parseRoutineEntry(item);
		if (typeof routine === 'string') return fail(`Routine ${index + 1} is not valid: ${routine}`);
		routines.push(routine);
	}

	const tasks: ExportedTask[] = [];
	for (const [index, item] of raw.tasks.entries()) {
		// The kind and the parent have their own reading below, an unknown kind is a block rather than a refused file
		const parsed = parseTaskInput(
			isRecord(item) ? { ...item, kind: undefined, parentId: undefined, shift: undefined } : item,
			'create'
		);
		if (!parsed.ok) return fail(`Task ${index + 1} is not valid: ${parsed.error}`);
		const task = parsed.value;
		tasks.push({
			title: task.title!,
			description: task.description!,
			date: task.date!,
			startTime: task.startTime!,
			duration: task.duration!,
			priority: task.priority!,
			status: (task.status as TaskStatus | undefined) ?? TaskStatus.Pending,
			completedAt: readMoment(isRecord(item) ? item.completedAt : null),
			kind: readKind(item),
			parent: readParent(item, raw.tasks.length),
			shift: readShift(item),
			routine: readRoutine(item, routines.length)
		});
	}

	// A file from version 1 has no to-dos
	const todoList = raw.todos ?? [];
	if (!Array.isArray(todoList) || todoList.length > EXPORT_LIMITS.todos)
		return fail(`The file needs a list of at most ${EXPORT_LIMITS.todos} to-dos`);
	const todos: ExportedTodo[] = [];
	for (const [index, item] of todoList.entries()) {
		const todo = parseTodoEntry(item, tasks.length);
		if (typeof todo === 'string') return fail(`To-do ${index + 1} is not valid: ${todo}`);
		todos.push(todo);
	}

	const alarmList = raw.alarms ?? [];
	if (!Array.isArray(alarmList) || alarmList.length > EXPORT_LIMITS.alarms)
		return fail(`The file needs a list of at most ${EXPORT_LIMITS.alarms} alarms`);
	const alarms: ExportedAlarm[] = [];
	for (const [index, item] of alarmList.entries()) {
		const alarm = parseAlarmEntry(item);
		if (!alarm) return fail(`Alarm ${index + 1} is not valid`);
		alarms.push(alarm);
	}

	const settings: ExportFile['settings'] = {};
	if (raw.settings !== undefined) {
		if (!isRecord(raw.settings)) return fail('The settings in the file are not valid');
		const { timezone, ...rest } = raw.settings;
		if (timezone !== undefined) {
			if (typeof timezone !== 'string' || !isValidTimezone(timezone))
				return fail('The timezone in the file is not valid');
			settings.timezone = timezone;
		}
		if (Object.keys(rest).length > 0) {
			const patch = parseSettingsPatch(rest);
			if (!patch.ok) return fail(`The settings in the file are not valid: ${patch.error}`);
			Object.assign(settings, patch.value);
		}
	}

	return {
		ok: true,
		value: {
			app: EXPORT_APP,
			version: EXPORT_VERSION,
			exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
			settings,
			tasks,
			todos,
			routines,
			alarms,
			// The flow log is for the user to read, it is not brought back in
			flow: []
		}
	};
}

export interface ImportResult {
	tasks: number;
	/** Tasks that were already in the plan and were left alone. */
	skipped: number;
	alarms: number;
	todos: number;
}

/** What makes two tasks the same one for an import: when, how long and what it is called. */
export const sameTask = (task: {
	title: string;
	date: string;
	startTime: number;
	duration: number;
}) => `${task.date}|${task.startTime}|${task.duration}|${task.title}`;

/** What makes two to-dos the same one for an import: what it is called and when it is due. */
export const sameTodo = (todo: { title: string; dueDate: string | null }) =>
	`${todo.dueDate ?? ''}|${todo.title}`;

/** What makes two routines the same one for an import: what it is called, when, how often and from which day. */
export const sameRoutine = (routine: {
	title: string;
	startTime: number;
	repeat: string;
	firstDay: string;
}) => `${routine.firstDay}|${routine.startTime}|${routine.repeat}|${routine.title}`;

/** The sentence that tells what an import did. */
export function describeImport({ tasks, skipped, alarms, todos }: ImportResult): string {
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const parts = [`Imported ${plural(tasks, 'task')}`];
	if (todos) parts.push(plural(todos, 'to-do'));
	if (alarms) parts.push(plural(alarms, 'alarm'));
	const said = parts.join(' and ');
	return skipped ? `${said}. ${plural(skipped, 'task')} already here, left alone.` : `${said}.`;
}

/** The name of a downloaded export, one per day. */
export const exportFileName = (date: string) => `adhd-tasker-${date}.json`;

/**
 * Adds what the file holds. A task or an alarm that is already there is left alone, so importing the same file twice
 * changes nothing, and nothing the user has is replaced. The file's settings are applied. Written straight to the
 * repo: an import is not a thousand plan edits for the agent to react to.
 */
export async function importExport(
	repo: Repo,
	file: ExportFile,
	now: number
): Promise<ImportResult> {
	// Where each of the file's routines is now, so its tasks can say which one made them
	const knownRoutines = new Map(
		(await repo.routines.all()).map((routine) => [sameRoutine(routine), routine.id])
	);
	const routineIds: number[] = [];
	for (const routine of file.routines) {
		const key = sameRoutine(routine);
		let id = knownRoutines.get(key);
		if (id === undefined) {
			id = (await repo.routines.insert(routine)).id;
			knownRoutines.set(key, id);
		}
		routineIds.push(id);
	}

	// Where each of the file's tasks is in the plan now, so a to-do can find its appointment
	const known = new Map(
		(await repo.tasks.between(FIRST_DAY)).map((task) => [sameTask(task), task.id])
	);
	const ids: number[] = [];
	const made: { id: number; parent: number }[] = [];
	let added = 0;
	let skipped = 0;
	for (const { parent, routine, ...task } of file.tasks) {
		const key = sameTask(task);
		const there = known.get(key);
		if (there !== undefined) {
			ids.push(there);
			skipped++;
			continue;
		}
		const created = await repo.tasks.insert({
			...task,
			routineId: routine === null || routine === undefined ? null : (routineIds[routine] ?? null)
		});
		known.set(key, created.id);
		ids.push(created.id);
		if (task.kind === 'travel' && parent !== null && parent !== undefined)
			made.push({ id: created.id, parent });
		added++;
	}
	// A travel task finds its appointment once every task of the file has an id
	for (const { id, parent } of made) {
		const appointment = ids[parent];
		if (appointment !== undefined) await repo.tasks.update(id, { parentId: appointment });
	}

	const knownTodos = new Set((await repo.todos.all()).map(sameTodo));
	let todos = 0;
	for (const { parent, ...todo } of file.todos) {
		const key = sameTodo(todo);
		if (knownTodos.has(key)) continue;
		knownTodos.add(key);
		await repo.todos.insert({ ...todo, parentId: parent === null ? null : (ids[parent] ?? null) });
		todos++;
	}

	const pending = (await repo.schedule.pending()).filter((entry) => entry.kind === 'alarm');
	const same = (a: ExportedAlarm | ScheduleEntry, b: ExportedAlarm) =>
		a.fireAt === b.fireAt && a.repeat === b.repeat && (a.label ?? '') === b.label;
	let alarms = 0;
	for (const alarm of file.alarms) {
		// A one-off alarm in the past would only be retired, an old alarm is not worth bringing back
		if (alarm.repeat === 'none' && alarm.fireAt < now) continue;
		if (pending.some((entry) => same(entry, alarm)) || pending.length >= EXPORT_LIMITS.alarms)
			continue;
		await repo.schedule.insert({
			kind: 'alarm',
			fireAt: alarm.fireAt,
			minutes: alarm.minutes,
			repeat: alarm.repeat,
			label: alarm.label,
			tone: alarm.tone,
			durationMin: alarm.durationMin,
			enabled: alarm.enabled ?? true,
			createdBy: 'user',
			createdAt: now
		});
		pending.push({ ...alarm, createdBy: 'user' } as unknown as ScheduleEntry);
		alarms++;
	}

	if (Object.keys(file.settings).length > 0) await repo.settings.update(file.settings);
	return { tasks: added, skipped, alarms, todos };
}
