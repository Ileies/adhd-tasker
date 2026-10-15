/**
 * The file a user can take with them: the plan, the alarms and the settings that are theirs to choose, as
 * one JSON document with a format version. A guest exports from the device, an account from the server, and the same
 * file moves a guest's plan into an account (local first plan 5.3). It never holds the OpenAI key, the
 * assistant's log or anything that belongs to one machine (display device, linked Google services).
 */
import type { NewTask, Repo, ScheduleEntry, Settings, Task } from '#lib/core/repo.js';
import { REPEATS, SCHEDULE_LIMITS, type Repeat } from '#lib/schedule.js';
import { parseSettingsPatch, type SettingsPatch } from '#lib/settings.js';
import { isValidTimezone } from '#lib/time.js';
import { parseTaskInput } from '#lib/task-input.js';
import { readTone, type Tone } from '#lib/tones.js';
import { TaskStatus } from '#lib/types.js';

export const EXPORT_APP = 'adhd-tasker';
export const EXPORT_VERSION = 1;

/** Bounds on what an import accepts, so a wrong file cannot fill the device. */
export const EXPORT_LIMITS = { tasks: 20_000, alarms: SCHEDULE_LIMITS.maxAlarms } as const;

export type ExportedTask = Required<NewTask>;

export interface ExportedAlarm {
	fireAt: number;
	minutes: number | null;
	repeat: Repeat;
	label: string;
	tone: Tone;
	durationMin: number;
}

export interface ExportFile {
	app: typeof EXPORT_APP;
	version: typeof EXPORT_VERSION;
	exportedAt: number;
	settings: SettingsPatch & { timezone?: string };
	tasks: ExportedTask[];
	alarms: ExportedAlarm[];
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
	'showClock',
	'clock12h',
	'checkInMinutes',
	'myDayStart',
	'myDayEnd'
] as const satisfies readonly (keyof SettingsPatch)[];

export const FIRST_DAY = '0000-01-01';

/**
 * The file for rows that are already read: the plan, the pending alarms (the assistant's wakeups are not
 * exported) and the settings the user chose. Pure, so the server can build it inside a transaction.
 */
export function assembleExport(rows: {
	settings: Settings;
	tasks: Task[];
	schedule: ScheduleEntry[];
	now: number;
}): ExportFile {
	const settings: ExportFile['settings'] = {};
	for (const key of SETTING_KEYS) Object.assign(settings, { [key]: rows.settings[key] });
	if (rows.settings.timezone) settings.timezone = rows.settings.timezone;

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
			status: task.status
		})),
		alarms: rows.schedule
			.filter((entry) => entry.kind === 'alarm')
			.map((entry) => ({
				fireAt: entry.fireAt,
				minutes: entry.minutes,
				repeat: entry.repeat,
				label: entry.label ?? '',
				tone: readTone(entry.tone),
				durationMin: entry.durationMin
			}))
	};
}

export async function buildExport(repo: Repo, now: number): Promise<ExportFile> {
	return assembleExport({
		settings: await repo.settings.get(),
		tasks: await repo.tasks.between(FIRST_DAY),
		schedule: await repo.schedule.pending(),
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
	if (!REPEATS.includes(repeat as Repeat)) return null;
	if (typeof label !== 'string' || !label.trim() || label.length > SCHEDULE_LIMITS.maxLabel)
		return null;
	if (
		typeof durationMin !== 'number' ||
		!Number.isInteger(durationMin) ||
		durationMin < 1 ||
		durationMin > SCHEDULE_LIMITS.maxAlarmMinutes
	)
		return null;
	if (repeat !== 'none' && minutes === null) return null;
	return {
		fireAt,
		minutes,
		repeat: repeat as Repeat,
		label: label.trim(),
		tone: readTone(raw.tone),
		durationMin
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
	const tasks: ExportedTask[] = [];
	for (const [index, item] of raw.tasks.entries()) {
		const parsed = parseTaskInput(item, 'create');
		if (!parsed.ok) return fail(`Task ${index + 1} is not valid: ${parsed.error}`);
		const task = parsed.value;
		tasks.push({
			title: task.title!,
			description: task.description!,
			date: task.date!,
			startTime: task.startTime!,
			duration: task.duration!,
			priority: task.priority!,
			status: (task.status as TaskStatus | undefined) ?? TaskStatus.Pending
		});
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
			alarms
		}
	};
}

export interface ImportResult {
	tasks: number;
	/** Tasks that were already in the plan and were left alone. */
	skipped: number;
	alarms: number;
}

/** What makes two tasks the same one for an import: when, how long and what it is called. */
export const sameTask = (task: {
	title: string;
	date: string;
	startTime: number;
	duration: number;
}) => `${task.date}|${task.startTime}|${task.duration}|${task.title}`;

/** The sentence that tells what an import did. */
export function describeImport({ tasks, skipped, alarms }: ImportResult): string {
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const parts = [`Imported ${plural(tasks, 'task')}`];
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
	const known = new Set((await repo.tasks.between(FIRST_DAY)).map(sameTask));
	let added = 0;
	let skipped = 0;
	for (const task of file.tasks) {
		const key = sameTask(task);
		if (known.has(key)) {
			skipped++;
			continue;
		}
		known.add(key);
		await repo.tasks.insert(task);
		added++;
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
			createdBy: 'user',
			createdAt: now
		});
		pending.push({ ...alarm, createdBy: 'user' } as unknown as ScheduleEntry);
		alarms++;
	}

	if (Object.keys(file.settings).length > 0) await repo.settings.update(file.settings);
	return { tasks: added, skipped, alarms };
}
