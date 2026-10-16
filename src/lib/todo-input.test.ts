/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { hasDueTime, newTodoOf, parseTodoId, parseTodoInput } from '#lib/todo-input.js';
import { Priority } from '#lib/types.js';

const ok = (body: unknown, mode: 'create' | 'update' = 'create') => {
	const result = parseTodoInput(body, mode);
	if (!result.ok) throw new Error(result.error);
	return result.value;
};
const error = (body: unknown, mode: 'create' | 'update' = 'create') => {
	const result = parseTodoInput(body, mode);
	if (result.ok) throw new Error('expected an error');
	return result.error;
};

describe('parseTodoInput create', () => {
	test('a title is enough and is trimmed', () => {
		expect(ok({ title: '  Study Math ' })).toEqual({ title: 'Study Math' });
	});

	test('keeps every field a user may set', () => {
		const body = {
			title: 'Study Math',
			description: 'chapters 1 to 4',
			priority: 4,
			estimate: 600,
			progress: 10,
			dueDate: '2026-11-05',
			dueTime: 665,
			notBefore: '2026-10-20',
			parentId: 7,
			nextStep: ' Open the notes ',
			status: 'open'
		};
		expect(ok(body)).toEqual({
			...body,
			learned: false,
			nextStep: 'Open the notes'
		} as ReturnType<typeof ok>);
	});

	test('ignores keys the engine owns and keys it does not know', () => {
		const value = ok({
			title: 'x',
			spentMinutes: 90,
			skips: 4,
			learned: true,
			id: 3,
			email: 'a@b.c'
		});
		expect(Object.keys(value)).toEqual(['title']);
	});

	test.each([undefined, '', '   ', 5, 'x'.repeat(201)])('refuses the title %p', (title) => {
		expect(error({ title })).toContain('title');
	});

	test('a size typed by the user replaces a learned one', () => {
		expect(ok({ title: 'x', estimate: 30 }).learned).toBe(false);
	});

	test('null clears the optional fields', () => {
		expect(
			ok(
				{
					estimate: null,
					dueDate: null,
					dueTime: null,
					notBefore: null,
					parentId: null,
					nextStep: null
				},
				'update'
			)
		).toMatchObject({
			estimate: null,
			dueDate: null,
			dueTime: null,
			notBefore: null,
			parentId: null,
			nextStep: null
		});
	});

	test('a blank next step is cleared', () => {
		expect(ok({ nextStep: '   ' }, 'update').nextStep).toBeNull();
	});

	test.each([
		['estimate', 0],
		['estimate', 30_001],
		['estimate', 1.5],
		['estimate', '60'],
		['progress', -1],
		['progress', 101],
		['progress', 12.5],
		['priority', 0],
		['priority', 6],
		['dueDate', '5.11.'],
		['dueDate', '2026-13-40'],
		['dueTime', 1440],
		['dueTime', -1],
		['notBefore', 'tomorrow'],
		['parentId', 0],
		['parentId', 'x'],
		['nextStep', 5],
		['description', 5],
		['status', 'ended'],
		['status', 'finished']
	])('refuses %s %p', (field, value) => {
		expect(parseTodoInput({ title: 'x', [field]: value }, 'create').ok).toBe(false);
	});

	test('a due time needs a due date', () => {
		expect(error({ title: 'x', dueTime: 600 })).toBe('dueTime needs a dueDate');
		expect(ok({ title: 'x', dueDate: '2026-11-05', dueTime: 600 }).dueTime).toBe(600);
	});

	test('a long description is cut', () => {
		expect(ok({ title: 'x', description: 'a'.repeat(1500) }).description).toHaveLength(1000);
	});
});

describe('parseTodoInput update', () => {
	test('takes any subset', () => {
		expect(ok({ progress: 40 }, 'update')).toEqual({ progress: 40 });
	});

	test('refuses an empty patch', () => {
		expect(error({ id: 3 }, 'update')).toBe('nothing to change');
	});

	test('a due time alone is left to the caller to check against the saved date', () => {
		expect(ok({ dueTime: 600 }, 'update')).toEqual({ dueTime: 600 });
	});

	test('a due time with a cleared date is refused', () => {
		expect(error({ dueDate: null, dueTime: 600 }, 'update')).toBe('dueTime needs a dueDate');
	});
});

describe('hasDueTime', () => {
	test.each([
		[{}, true],
		[{ dueTime: null }, true],
		[{ dueTime: 600 }, false],
		[{ dueTime: 600, dueDate: null }, false],
		[{ dueTime: 600, dueDate: '2026-11-05' }, true]
	])('%p is %p', (todo, expected) => {
		expect(hasDueTime(todo)).toBe(expected);
	});
});

describe('parseTodoId', () => {
	test.each([
		[3, 3],
		[0, undefined],
		[-1, undefined],
		[1.5, undefined],
		['3', undefined],
		[null, undefined]
	])('%p gives %p', (value, expected) => {
		expect(parseTodoId(value)).toBe(expected);
	});
});

describe('newTodoOf', () => {
	test('defaults the priority to medium and stamps the time', () => {
		expect(newTodoOf({ title: 'x' }, 5000)).toEqual({
			title: 'x',
			priority: Priority.Medium,
			createdAt: 5000
		});
	});

	test('keeps a given priority', () => {
		expect(newTodoOf({ title: 'x', priority: Priority.Critical }, 1).priority).toBe(
			Priority.Critical
		);
	});
});
