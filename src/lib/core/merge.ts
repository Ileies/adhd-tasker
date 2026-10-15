/**
 * What a guest's plan and an account's plan have in common, so the move screen can warn before anything is
 * written (local first plan 5.3). Pure: both plans come as export files, the device's without the sample day.
 */
import { sameTask, type ExportedTask, type ExportFile } from '#lib/core/export.js';

export interface PlanSummary {
	tasks: number;
	/** Days that have at least one task. */
	days: number;
	alarms: number;
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
		alarms: file.alarms.length
	};
}

/** Nothing to move, or nothing to lose: no task and no alarm. */
export const isEmptyPlan = (file: ExportFile) =>
	file.tasks.length === 0 && file.alarms.length === 0;

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
