/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	EXPORT_APP,
	EXPORT_VERSION,
	sameTask,
	type ExportedTask,
	type ExportFile
} from '#lib/core/export.js';
import {
	comparePlans,
	describeBackup,
	describeMove,
	describeSnapshot,
	isEmptyPlan,
	summarize
} from '#lib/core/merge.js';
import { Priority, TaskStatus } from '#lib/types.js';

const task = (date: string, startTime: number, duration: number, title = 'Task'): ExportedTask => ({
	title,
	description: '',
	date,
	startTime,
	duration,
	priority: Priority.Medium,
	status: TaskStatus.Pending
});

const alarm = {
	fireAt: 1,
	minutes: 480,
	repeat: 'daily',
	label: 'Wake',
	tone: { name: 'chime' },
	durationMin: 5
} as unknown as ExportFile['alarms'][number];

const file = (tasks: ExportedTask[], alarms: ExportFile['alarms'] = []): ExportFile => ({
	app: EXPORT_APP,
	version: EXPORT_VERSION,
	exportedAt: 0,
	settings: {},
	tasks,
	todos: [],
	alarms,
	flow: []
});

describe('summarize', () => {
	test('counts tasks, the days they are on and alarms', () => {
		const plan = file(
			[task('2026-10-14', 540, 60), task('2026-10-14', 700, 30), task('2026-10-15', 540, 60)],
			[alarm]
		);
		expect(summarize(plan)).toEqual({ tasks: 3, days: 2, alarms: 1, todos: 0 });
	});
});

describe('isEmptyPlan', () => {
	test('a plan with an alarm only is not empty', () => {
		expect(isEmptyPlan(file([]))).toBe(true);
		expect(isEmptyPlan(file([], [alarm]))).toBe(false);
		expect(isEmptyPlan(file([task('2026-10-14', 540, 60)]))).toBe(false);
	});
});

describe('describeMove', () => {
	test('says what moved and what was already there', () => {
		expect(describeMove({ tasks: 12, skipped: 0, alarms: 2, todos: 0, snapshotId: 1 })).toBe(
			'Your plan is now in your account: 12 tasks and 2 alarms.'
		);
		expect(describeMove({ tasks: 1, skipped: 3, alarms: 0, todos: 0, snapshotId: 1 })).toBe(
			'Your plan is now in your account: 1 task. 3 tasks already there, left alone.'
		);
	});
});

describe('describeSnapshot', () => {
	test('names the day in the timezone given, and what the plan holds', () => {
		const at = Date.UTC(2026, 9, 14, 23, 30);
		expect(describeSnapshot({ id: 1, createdAt: at, tasks: 48, alarms: 3, todos: 0 }, 'UTC')).toBe(
			'Restore the plan from before 14 Oct (48 tasks, 3 alarms)'
		);
		expect(
			describeSnapshot({ id: 1, createdAt: at, tasks: 1, alarms: 0, todos: 0 }, 'Asia/Tokyo')
		).toBe('Restore the plan from before 15 Oct (1 task)');
	});
});

describe('describeBackup', () => {
	test('names the day of the move and what the copy holds', () => {
		const at = Date.UTC(2026, 9, 14, 12);
		expect(describeBackup(file([task('2026-10-14', 540, 60)], [alarm]), at, 'UTC')).toBe(
			'Restore the plan that moved into your account on 14 Oct (1 task, 1 alarm)'
		);
	});
});

describe('comparePlans', () => {
	test('finds the days where tasks of both plans overlap, oldest first', () => {
		const device = file([
			task('2026-10-16', 600, 60, 'Device B'),
			task('2026-10-14', 540, 60, 'Device A'),
			task('2026-10-15', 540, 30, 'Device alone')
		]);
		const account = file([
			task('2026-10-16', 630, 60, 'Account B'),
			task('2026-10-14', 570, 60, 'Account A'),
			task('2026-10-15', 900, 30, 'Account alone')
		]);
		const result = comparePlans(device, account);
		expect(result.clashes.map((day) => day.date)).toEqual(['2026-10-14', '2026-10-16']);
		expect(result.clashes[0].device.map((t) => t.title)).toEqual(['Device A']);
		expect(result.clashes[0].account.map((t) => t.title)).toEqual(['Account A']);
		expect(result.clashingTasks).toBe(4);
	});

	test('tasks that only touch do not clash, the end is exclusive', () => {
		const result = comparePlans(
			file([task('2026-10-14', 540, 60)]),
			file([task('2026-10-14', 600, 60)])
		);
		expect(result.clashes).toEqual([]);
	});

	test('the same task on both sides is not a clash, an import leaves it alone', () => {
		const same = task('2026-10-14', 540, 60, 'Write intro');
		expect(comparePlans(file([same]), file([{ ...same }])).clashes).toEqual([]);
	});

	test('one task that overlaps two on the other side counts every task once', () => {
		const result = comparePlans(
			file([task('2026-10-14', 540, 180, 'Long')]),
			file([task('2026-10-14', 540, 30, 'One'), task('2026-10-14', 600, 30, 'Two')])
		);
		expect(result.clashes).toHaveLength(1);
		expect(result.clashingTasks).toBe(3);
	});

	test('different days never clash', () => {
		const result = comparePlans(
			file([task('2026-10-14', 540, 60)]),
			file([task('2026-10-15', 540, 60)])
		);
		expect(result.clashes).toEqual([]);
	});

	test('both plans are counted', () => {
		const result = comparePlans(file([task('2026-10-14', 540, 60)], [alarm]), file([]));
		expect(result.device).toEqual({ tasks: 1, days: 1, alarms: 1, todos: 0 });
		expect(result.account).toEqual({ tasks: 0, days: 0, alarms: 0, todos: 0 });
	});

	const arbTask = fc
		.record({
			date: fc.constantFrom('2026-10-14', '2026-10-15', '2026-10-16'),
			startTime: fc.integer({ min: 0, max: 1380 }),
			duration: fc.integer({ min: 5, max: 60 }),
			title: fc.constantFrom('A', 'B', 'C')
		})
		.map((t) => task(t.date, t.startTime, t.duration, t.title));

	test('a plan never clashes with itself', () => {
		fc.assert(
			fc.property(fc.array(arbTask, { maxLength: 30 }), (tasks) => {
				expect(comparePlans(file(tasks), file(tasks)).clashes).toEqual([]);
			})
		);
	});

	test('a task the account already has is not a clash with its neighbours', () => {
		const first = task('2026-10-14', 540, 60, 'First');
		const second = task('2026-10-14', 570, 60, 'Second');
		expect(comparePlans(file([first, second]), file([first, second])).clashes).toEqual([]);
	});

	test('every clash is a task the import would add, and an overlap with a task of the account', () => {
		fc.assert(
			fc.property(
				fc.array(arbTask, { maxLength: 20 }),
				fc.array(arbTask, { maxLength: 20 }),
				(device, account) => {
					const known = new Set(account.map(sameTask));
					for (const day of comparePlans(file(device), file(account)).clashes) {
						for (const mine of day.device) {
							expect(known.has(sameTask(mine))).toBe(false);
							expect(
								day.account.some(
									(theirs) =>
										mine.startTime < theirs.startTime + theirs.duration &&
										theirs.startTime < mine.startTime + mine.duration
								)
							).toBe(true);
						}
					}
				}
			)
		);
	});
});
