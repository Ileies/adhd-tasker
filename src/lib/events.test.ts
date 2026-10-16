/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	MISSED_GRACE_MINUTES,
	OVERRUN_MINUTES,
	STALE_MINUTES,
	describeChange,
	describeTodoChange,
	describeEvent,
	EVENT_TYPES,
	detectEvents
} from '#lib/events.js';
import { Priority, TaskStatus } from '#lib/types.js';

const task = (
	id: number,
	startTime: number,
	duration: number,
	priority = Priority.Medium,
	status = TaskStatus.Pending
) => ({
	id,
	title: `Task ${id}`,
	date: '2026-10-14',
	startTime,
	duration,
	priority,
	status
});

const types = (events: { type: string }[]) => events.map((event) => event.type);

describe('task.switched', () => {
	test('is silent when the tracked task is unknown', () => {
		const { events, currentId } = detectEvents([task(1, 540, 60)], 560, undefined);
		expect(events).toEqual([]);
		expect(currentId).toBe(1);
	});

	test('is silent while the current task stays the same', () => {
		expect(detectEvents([task(1, 540, 60)], 570, 1).events).toEqual([]);
	});

	test('reports the reason when a higher priority task starts', () => {
		const tasks = [task(1, 540, 120), task(2, 600, 30, Priority.Critical)];
		const { events, currentId } = detectEvents(tasks, 600, 1);
		expect(currentId).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('task.switched');
		expect(events[0].payload).toMatchObject({
			fromId: 1,
			toId: 2,
			reason: 'Critical priority task started'
		});
	});

	test('reports a task that was completed or removed', () => {
		const done = detectEvents([task(1, 540, 60, Priority.Medium, TaskStatus.Completed)], 560, 1);
		expect(done.events[0].payload).toMatchObject({
			toId: null,
			reason: 'Previous task done. Nothing else is due right now'
		});
		const removed = detectEvents([], 560, 1);
		expect(removed.events[0].payload).toMatchObject({
			reason: 'Previous task removed. Nothing else is due right now'
		});
	});

	test('no task to a task counts as a switch', () => {
		expect(detectEvents([task(1, 540, 60)], 540, null).events[0].payload).toMatchObject({
			fromId: null,
			toId: 1
		});
	});
});

describe('task.missed and task.overrun', () => {
	const tasks = [task(1, 480, 60), task(2, 400, 30)];

	test('waits for the grace period', () => {
		expect(
			detectEvents(tasks, 540 + MISSED_GRACE_MINUTES - 1, 1).events.filter(
				(e) => e.type !== 'task.switched'
			)
		).toEqual([]);
	});

	test('reports a missed task once its grace ended, with a stable key', () => {
		const a = detectEvents([task(1, 480, 60)], 540 + MISSED_GRACE_MINUTES, 1);
		const b = detectEvents([task(1, 480, 60)], 540 + MISSED_GRACE_MINUTES + 1, null);
		const keyOf = (events: ReturnType<typeof detectEvents>['events']) =>
			events.find((e) => e.type === 'task.missed')?.key;
		expect(keyOf(a.events)).toBeDefined();
		expect(keyOf(a.events)).toBe(keyOf(b.events));
	});

	test('a changed window gives a new key', () => {
		const first = detectEvents([task(1, 480, 60)], 560, 1).events.find(
			(e) => e.type === 'task.missed'
		);
		const extended = detectEvents([task(1, 480, 75)], 580, 1).events.find(
			(e) => e.type === 'task.missed'
		);
		expect(first!.key).not.toBe(extended!.key);
	});

	test('overrun is only the most recently ended task', () => {
		const events = detectEvents(tasks, 540 + OVERRUN_MINUTES, 1).events;
		const overrun = events.filter((e) => e.type === 'task.overrun');
		expect(overrun).toHaveLength(1);
		expect(overrun[0].payload.taskId).toBe(1);
		expect(types(events)).toContain('task.missed');
	});

	test.each(['appointment', 'travel'] as const)('a %s is never missed or overrun', (kind) => {
		const ended = [{ ...task(1, 480, 60), kind }];
		expect(types(detectEvents(ended, 540 + OVERRUN_MINUTES + 5, 1).events)).not.toContain(
			'task.missed'
		);
		expect(types(detectEvents(ended, 540 + OVERRUN_MINUTES + 5, 1).events)).not.toContain(
			'task.overrun'
		);
	});

	test('the overrun threshold can be changed', () => {
		const overrun = (now: number, minutes: number) =>
			detectEvents(tasks, now, 1, minutes).events.some((e) => e.type === 'task.overrun');
		expect(overrun(540 + 20, 30)).toBe(false);
		expect(overrun(540 + 30, 30)).toBe(true);
		expect(overrun(540 + 10, 10)).toBe(true);
	});

	test('ignores completed tasks and old history', () => {
		expect(
			detectEvents([task(1, 480, 60, Priority.Medium, TaskStatus.Completed)], 700, 1).events.filter(
				(e) => e.type !== 'task.switched'
			)
		).toEqual([]);
		expect(detectEvents([task(1, 100, 30)], 130 + STALE_MINUTES + 1, null).events).toEqual([]);
	});
});

describe('describeChange', () => {
	const base = { ...task(1, 540, 60), description: '' };

	test('classifies the edit', () => {
		expect(describeChange(null, base)?.type).toBe('task.created');
		expect(describeChange(base, null)?.type).toBe('task.deleted');
		expect(describeChange(base, { ...base, status: TaskStatus.Completed })).toMatchObject({
			type: 'task.completed',
			payload: { completed: true }
		});
		expect(describeChange({ ...base, status: TaskStatus.Completed }, base)).toMatchObject({
			type: 'task.completed',
			payload: { completed: false }
		});
		expect(describeChange(base, { ...base, startTime: 600 })).toMatchObject({
			type: 'task.updated',
			payload: { changed: ['startTime'] }
		});
	});

	test('ignores edits nobody would notice', () => {
		expect(describeChange(base, { ...base })).toBe(null);
		expect(describeChange(base, { ...base, status: TaskStatus.Active })).toBe(null);
		expect(describeChange(null, null)).toBe(null);
	});
});

describe('describeTodoChange', () => {
	const base = {
		id: 1,
		title: 'Taxes',
		status: 'open' as const,
		priority: Priority.Medium,
		estimate: 60,
		dueDate: null,
		dueTime: null,
		notBefore: null,
		parentId: null,
		nextStep: null
	};

	test('classifies the edit', () => {
		expect(describeTodoChange(null, base)?.type).toBe('todo.created');
		expect(describeTodoChange(base, null)?.type).toBe('todo.deleted');
		expect(describeTodoChange(base, { ...base, status: 'done' })).toMatchObject({
			type: 'todo.completed',
			payload: { completed: true }
		});
		expect(describeTodoChange({ ...base, status: 'done' }, base)).toMatchObject({
			type: 'todo.completed',
			payload: { completed: false }
		});
		expect(describeTodoChange(base, { ...base, dueDate: '2026-10-20' })).toMatchObject({
			type: 'todo.updated',
			payload: { changed: ['dueDate'] }
		});
	});

	test('dropping a to-do is an update that names the status', () => {
		expect(describeTodoChange(base, { ...base, status: 'dropped' })).toMatchObject({
			type: 'todo.updated',
			payload: { changed: ['status'] }
		});
	});

	test('ignores edits nobody would notice', () => {
		expect(describeTodoChange(base, { ...base })).toBe(null);
		expect(describeTodoChange(null, null)).toBe(null);
	});

	test('the description quotes the title and the due date', () => {
		expect(describeEvent('todo.created', { title: 'Taxes', dueDate: '2026-10-20' })).toBe(
			'To-do "Taxes" was added, due 2026-10-20'
		);
		expect(describeEvent('todo.completed', { title: 'Taxes', completed: false })).toBe(
			'To-do "Taxes" was reopened'
		);
	});
});

describe('describeEvent of the flow events', () => {
	test('a rotation says what the user said, in words', () => {
		expect(describeEvent('focus.rotated', { title: 'Study B', why: 'unfocused' })).toBe(
			`The user could not stay on the to-do "Study B" (they couldn't focus) and the app moved them on to something else`
		);
		expect(describeEvent('focus.rotated', { title: 'Study B', why: 'made-up' })).toContain(
			'(a struggle)'
		);
	});

	test('stuck on a to-do names the to-do and its id, on a task it stays as it was', () => {
		expect(
			describeEvent('stuck.pressed', { todoId: 5, title: 'Study B', reason: 'It feels too big' })
		).toBe(
			'The user pressed "I\'m stuck" on the to-do "Study B" (to-do #5) and said: "It feels too big"'
		);
		expect(describeEvent('stuck.pressed', { taskId: 2, title: 'Write', reason: 'x' })).toBe(
			'The user pressed "I\'m stuck" on "Write" and said: "x"'
		);
	});
});

describe('describeEvent', () => {
	test('quotes titles and names the time', () => {
		expect(describeEvent('task.created', { title: 'Call', startTime: 570 })).toBe(
			'Task "Call" was added at 09:30'
		);
		expect(describeEvent('task.completed', { title: 'Call', completed: false })).toBe(
			'Task "Call" was reopened'
		);
		expect(describeEvent('task.missed', { title: 'Call', minutesOver: 7 })).toContain(
			'7 minutes ago'
		);
	});
});

describe('every event type', () => {
	test.each([...EVENT_TYPES])('%s has a readable description even without a payload', (type) => {
		const line = describeEvent(type, {});
		expect(line.length).toBeGreaterThan(0);
		expect(line).not.toContain('[object Object]');
	});

	test('descriptions with a full payload never print undefined', () => {
		const payload = {
			title: 'Write intro',
			startTime: 540,
			changed: ['title'],
			from: 'A',
			to: 'B',
			reason: 'it started',
			minutesOver: 7,
			label: 'Leave',
			createdBy: 'user',
			note: 'check in'
		};
		for (const type of EVENT_TYPES) expect(describeEvent(type, payload)).not.toContain('undefined');
	});
});
