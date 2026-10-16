/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Todo } from '#lib/core/repo.js';
import { panelTodos, todoFormOf, todoLine, todoPatchOf } from '#lib/todoform.js';
import { Priority } from '#lib/types.js';

const todo = (id: number, patch: Partial<Todo> = {}): Todo => ({
	id,
	title: `To-do ${id}`,
	description: '',
	priority: Priority.Medium,
	status: 'open',
	estimate: null,
	learned: false,
	progress: 0,
	spentMinutes: 0,
	skips: 0,
	skipSince: null,
	dueDate: null,
	dueTime: null,
	parentId: null,
	notBefore: null,
	nextStep: null,
	createdAt: 1,
	completedAt: null,
	...patch
});

describe('todoPatchOf', () => {
	test('the form of a to-do makes back the same values', () => {
		const original = todo(1, {
			dueDate: '2026-11-05',
			dueTime: 600,
			estimate: 900,
			nextStep: 'Open the book',
			progress: 40,
			description: 'Chapters 1 to 4'
		});
		const made = todoPatchOf(todoFormOf(original));
		expect(made).toEqual({
			ok: true,
			patch: {
				title: original.title,
				priority: original.priority,
				estimate: 900,
				dueDate: '2026-11-05',
				dueTime: 600,
				nextStep: 'Open the book',
				progress: 40,
				description: 'Chapters 1 to 4'
			}
		});
	});

	test('a title is needed', () => {
		expect(todoPatchOf({ ...todoFormOf(todo(1)), title: '   ' })).toEqual({
			ok: false,
			error: 'Give the to-do a title'
		});
	});

	test('clearing the day clears the time with it', () => {
		const made = todoPatchOf({
			...todoFormOf(todo(1, { dueDate: '2026-11-05', dueTime: 600 })),
			dueDate: ''
		});
		expect(made).toMatchObject({ ok: true, patch: { dueDate: null, dueTime: null } });
	});

	test('an empty next step is no next step', () => {
		const made = todoPatchOf({ ...todoFormOf(todo(1, { nextStep: 'x' })), nextStep: '  ' });
		expect(made).toMatchObject({ ok: true, patch: { nextStep: null } });
	});

	test('a size below one minute is refused, an unknown size is fine', () => {
		expect(todoPatchOf({ ...todoFormOf(todo(1)), estimate: 0 })).toMatchObject({ ok: false });
		expect(todoPatchOf({ ...todoFormOf(todo(1)), estimate: null })).toMatchObject({ ok: true });
	});
});

describe('todoLine', () => {
	const TODAY = '2026-10-14';

	test.each([
		['nothing is known', {}, ''],
		['a size alone', { estimate: 900 }, 'about 15h'],
		['a due date alone', { dueDate: '2026-10-26' }, 'Due in 12 days'],
		[
			'time spent against the size',
			{ estimate: 900, spentMinutes: 240, dueDate: '2026-10-15' },
			'Due tomorrow, 4h of about 15h'
		],
		['progress without a size', { progress: 40 }, '40 %'],
		['overdue', { dueDate: '2026-10-10' }, 'Overdue'],
		['due today', { dueDate: TODAY }, 'Due today']
	] as const)('%s', (_name, patch, line) => {
		expect(todoLine(todo(1, patch), TODAY)).toBe(line);
	});
});

describe('panelTodos', () => {
	test('lists only open to-dos, the earliest due first, undated last', () => {
		const list = panelTodos([
			todo(1),
			todo(2, { dueDate: '2026-11-04' }),
			todo(3, { dueDate: '2026-11-01' }),
			todo(4, { status: 'done' }),
			todo(5, { status: 'dropped' })
		]);
		expect(list.map((entry) => entry.id)).toEqual([3, 2, 1]);
	});

	test('on the same day the earlier time and then the higher priority come first', () => {
		const list = panelTodos([
			todo(1, { dueDate: '2026-11-01' }),
			todo(2, { dueDate: '2026-11-01', dueTime: 600 }),
			todo(3, { dueDate: '2026-11-01', priority: Priority.Critical }),
			todo(4, { dueDate: '2026-11-01', dueTime: 540 })
		]);
		expect(list.map((entry) => entry.id)).toEqual([4, 2, 3, 1]);
	});

	test('without a due date the priority decides, then the age', () => {
		const list = panelTodos([todo(1), todo(2, { priority: Priority.High }), todo(3)]);
		expect(list.map((entry) => entry.id)).toEqual([2, 1, 3]);
	});

	test('does not change the list it was given', () => {
		const given = [todo(2), todo(1, { priority: Priority.High })];
		panelTodos(given);
		expect(given.map((entry) => entry.id)).toEqual([2, 1]);
	});
});
