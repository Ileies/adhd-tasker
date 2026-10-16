/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { placeDay, stored, type PlaceTask } from '#lib/placeday.js';
import { Priority, TaskStatus } from '#lib/types.js';

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

const item = (
	id: number,
	title: string,
	startTime: number,
	duration: number,
	patch = {}
): PlaceTask => ({
	id,
	title,
	startTime,
	duration,
	priority: Priority.Medium,
	status: TaskStatus.Pending,
	...patch
});

const meeting = (start = at(12), duration = 60) =>
	item(1, 'Meeting', start, duration, { kind: 'appointment', priority: Priority.High });
const lunch = (patch = {}) => item(2, 'Lunch', at(12), 45, { shift: 60, ...patch });

const startOf = (tasks: PlaceTask[], id: number) =>
	placeDay(tasks).find((task) => task.id === id)!.startTime;

describe('placeDay', () => {
	test('a task with nothing in its way stays and is not moved for anything', () => {
		const [placed] = placeDay([lunch()]);
		expect(placed).toMatchObject({ startTime: at(12), storedStart: at(12), movedFor: null });
	});

	test('lunch goes after the meeting when it fits within its shift', () => {
		const [, placed] = placeDay([meeting(), lunch()]);
		expect(placed).toMatchObject({ startTime: at(13), storedStart: at(12), movedFor: 'Meeting' });
	});

	test('lunch goes before a meeting that ran over when nothing fits after it', () => {
		expect(startOf([meeting(at(12), 90), lunch()], 2)).toBe(at(11, 15));
	});

	test('lunch is back at its time when the meeting is gone', () => {
		expect(startOf([lunch()], 2)).toBe(at(12));
	});

	test('nothing fits within the shift: the task stays and overlaps as it did', () => {
		const [, placed] = placeDay([meeting(at(11), 180), lunch()]);
		expect(placed).toMatchObject({ startTime: at(12), movedFor: null });
	});

	test('a task with shift 0 stays even under an appointment', () => {
		expect(startOf([meeting(), lunch({ shift: 0 })], 2)).toBe(at(12));
	});

	test('a moved start is on the 15 minute grid', () => {
		expect(startOf([meeting(at(12), 70), lunch({ shift: 120 })], 2)).toBe(at(13, 15));
	});

	test('travel is something to make room for like an appointment', () => {
		const travel = item(3, 'Drive', at(11, 15), 45, { kind: 'travel', parentId: 1 });
		const early = lunch({ startTime: at(11, 30), shift: 120 });
		expect(startOf([meeting(), travel, early], 2)).toBe(at(13));
	});

	test('a done task is not moved and still takes its minutes', () => {
		const done = lunch({ status: TaskStatus.Completed });
		expect(startOf([meeting(), done], 2)).toBe(at(12));
		const other = item(4, 'Walk', at(12), 30, { shift: 120 });
		expect(startOf([done, other], 4)).toBe(at(12, 45));
	});

	test('the higher priority keeps its time and the other makes room', () => {
		const a = item(3, 'Report', at(12), 60, { shift: 60, priority: Priority.Low });
		const b = item(4, 'Call', at(12), 60, { shift: 60, priority: Priority.High });
		expect(startOf([a, b], 4)).toBe(at(12));
		expect(startOf([a, b], 3)).toBe(at(13));
	});

	test('a task never moves past midnight', () => {
		const late = item(3, 'Wind down', at(23), 60, { shift: 30 });
		const call = item(4, 'Call', at(23), 60, { kind: 'appointment' });
		expect(startOf([call, late], 3)).toBe(at(23));
	});

	test('a task moves earlier within the day when later would cross midnight', () => {
		const late = item(3, 'Wind down', at(23), 60, { shift: 60 });
		const call = item(4, 'Call', at(23), 60, { kind: 'appointment' });
		expect(startOf([call, late], 3)).toBe(at(22));
	});

	test('a task never moves before midnight of its day', () => {
		const early = item(5, 'Run', 0, 30, { shift: 60 });
		const block = item(6, 'Flight', 0, 30, { kind: 'appointment' });
		expect(startOf([block, early], 5)).toBe(30);
	});

	test('placing again changes nothing', () => {
		const once = placeDay([meeting(), lunch()]);
		const twice = placeDay(once);
		expect(twice.map((task) => task.startTime)).toEqual(once.map((task) => task.startTime));
	});

	test('stored gives back the time the user gave, also from a copy with a field changed', () => {
		const [, placed] = placeDay([meeting(), lunch()]);
		expect(stored(placed!).startTime).toBe(at(12));
		expect(stored({ ...placed!, status: TaskStatus.Completed }).startTime).toBe(at(12));
		expect(stored(placed!)).not.toHaveProperty('movedFor');
	});

	test('stored leaves a task that was never placed as it is', () => {
		const task = lunch();
		expect(stored(task)).toBe(task);
	});

	test('the input is not changed', () => {
		const tasks = [meeting(), lunch()];
		placeDay(tasks);
		expect(tasks[1]!.startTime).toBe(at(12));
	});
});
