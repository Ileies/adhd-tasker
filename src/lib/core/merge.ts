/**
 * What a guest's plan and an account's plan have in common, so the move screen can warn before anything is
 * written (local first plan 5.3). Pure: both plans come as export files, the device's without the sample day.
 */
import {
	sameTask,
	type ExportedTask,
	type ExportFile,
	type ImportResult
} from '#lib/core/export.js';

/** How long the account's plan from before a move is kept. */
export const SNAPSHOT_DAYS = 30;

/** `both` adds the device's plan to the account's, `replace` puts it in place of the account's plan from today on. */
export type MoveMode = 'both' | 'replace';
export const MOVE_MODES: readonly MoveMode[] = ['both', 'replace'];

export interface MoveResult extends ImportResult {
	/** The account's plan as it was before, to bring back with a restore. */
	snapshotId: number;
}

export interface SnapshotInfo {
	id: number;
	createdAt: number;
	tasks: number;
	alarms: number;
	todos: number;
}

export interface PlanSummary {
	tasks: number;
	/** Days that have at least one task. */
	days: number;
	alarms: number;
	todos: number;
}

/** Both plans want the same time of one day. */
export interface Clash {
	date: string;
	device: ExportedTask[];
	account: ExportedTask[];
}

export interface Comparison {
	device: PlanSummary;
	account: PlanSummary;
	/** Oldest day first. */
	clashes: Clash[];
	/** Tasks on either side that are part of a clash. */
	clashingTasks: number;
}

export function summarize(file: ExportFile): PlanSummary {
	return {
		tasks: file.tasks.length,
		days: new Set(file.tasks.map((task) => task.date)).size,
		alarms: file.alarms.length,
		todos: file.todos.length
	};
}

/** Nothing to move, or nothing to lose: no task, no to-do and no alarm. */
export const isEmptyPlan = (file: ExportFile) =>
	file.tasks.length === 0 && file.todos.length === 0 && file.alarms.length === 0;

const overlaps = (a: ExportedTask, b: ExportedTask) =>
	a.startTime < b.startTime + b.duration && b.startTime < a.startTime + a.duration;

/**
 * Counts both plans and finds the days where a task of the device and a task of the account overlap. A task the
 * account already has is left alone by an import, so it cannot clash with anything.
 */
export function comparePlans(device: ExportFile, account: ExportFile): Comparison {
	const accountByDate = new Map<string, ExportedTask[]>();
	for (const task of account.tasks) {
		const day = accountByDate.get(task.date) ?? [];
		day.push(task);
		accountByDate.set(task.date, day);
	}
	const known = new Set(account.tasks.map(sameTask));

	const clashes = new Map<string, { device: Set<ExportedTask>; account: Set<ExportedTask> }>();
	for (const mine of device.tasks) {
		if (known.has(sameTask(mine))) continue;
		for (const theirs of accountByDate.get(mine.date) ?? []) {
			if (!overlaps(mine, theirs)) continue;
			const day = clashes.get(mine.date) ?? { device: new Set(), account: new Set() };
			day.device.add(mine);
			day.account.add(theirs);
			clashes.set(mine.date, day);
		}
	}

	const days = [...clashes].sort(([a], [b]) => a.localeCompare(b));
	return {
		device: summarize(device),
		account: summarize(account),
		clashes: days.map(([date, day]) => ({
			date,
			device: [...day.device].sort((a, b) => a.startTime - b.startTime),
			account: [...day.account].sort((a, b) => a.startTime - b.startTime)
		})),
		clashingTasks: days.reduce((sum, [, day]) => sum + day.device.size + day.account.size, 0)
	};
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The sentence that tells what a move did. */
export function describeMove({ tasks, skipped, alarms, todos }: MoveResult): string {
	const moved = [
		plural(tasks, 'task'),
		...(todos ? [plural(todos, 'to-do')] : []),
		...(alarms ? [plural(alarms, 'alarm')] : [])
	].join(' and ');
	const base = `Your plan is now in your account: ${moved}.`;
	return skipped ? `${base} ${plural(skipped, 'task')} already there, left alone.` : base;
}

/** What a plan holds, in words: to-dos and alarms are only named when there are some. */
export function describeCounts(tasks: number, alarms: number, todos = 0): string {
	return [
		plural(tasks, 'task'),
		...(todos ? [plural(todos, 'to-do')] : []),
		...(alarms ? [plural(alarms, 'alarm')] : [])
	].join(', ');
}

const shortDay = (at: number, timezone: string) =>
	new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: timezone });

/** The label of a snapshot in the list, in the day the account's timezone has. */
export function describeSnapshot(snapshot: SnapshotInfo, timezone: string): string {
	return `Restore the plan from before ${shortDay(snapshot.createdAt, timezone)} (${describeCounts(snapshot.tasks, snapshot.alarms, snapshot.todos)})`;
}

/** The label of the copy a device keeps after its plan moved into an account. */
export function describeBackup(file: ExportFile, at: number, timezone: string): string {
	return `Restore the plan that moved into your account on ${shortDay(at, timezone)} (${describeCounts(file.tasks.length, file.alarms.length, file.todos.length)})`;
}
