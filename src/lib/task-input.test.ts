/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { fitsInDay, parseTaskId, parseTaskInput } from '#lib/task-input.js';
import { isDateKey } from '#lib/time.js';

const valid = {
	title: ' Write intro ',
	description: 'draft',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: 3
};

describe('parseTaskInput create', () => {
	test('trims the title and keeps the other fields', () => {
		expect(parseTaskInput(valid, 'create')).toEqual({
			ok: true,
			value: { ...valid, title: 'Write intro' }
		});
	});

	test('description defaults to empty and the status is optional', () => {
		const { description: _, ...rest } = valid;
		const result = parseTaskInput({ ...rest, status: 'completed' }, 'create');
		expect(result.ok && result.value).toMatchObject({ description: '', status: 'completed' });
	});

	test('ignores keys it does not know, like the id and the owner', () => {
		const result = parseTaskInput({ ...valid, id: 4, email: 'x@example.com' }, 'create');
		expect(result.ok && Object.keys(result.value).sort()).toEqual(
			['date', 'description', 'duration', 'priority', 'startTime', 'title'].sort()
		);
	});

	test.each(['title', 'date', 'startTime', 'duration', 'priority'])('needs %s', (field) => {
		expect(parseTaskInput({ ...valid, [field]: undefined }, 'create').ok).toBe(false);
	});

	test.each([
		['a body that is not an object', 'task'],
		['no body', null]
	])('rejects %s', (_name, body) => {
		expect(parseTaskInput(body, 'create').ok).toBe(false);
	});

	test('a task that ends exactly at midnight fits, one minute more does not', () => {
		expect(parseTaskInput({ ...valid, startTime: 1380, duration: 60 }, 'create').ok).toBe(true);
		expect(parseTaskInput({ ...valid, startTime: 1380, duration: 61 }, 'create').ok).toBe(false);
	});
});

describe('parseTaskInput update', () => {
	test('only the given fields end up in the patch', () => {
		expect(parseTaskInput({ id: 3, startTime: 600, status: 'completed' }, 'update')).toEqual({
			ok: true,
			value: { startTime: 600, status: 'completed' }
		});
	});

	test('needs at least one change', () => {
		expect(parseTaskInput({ id: 3 }, 'update').ok).toBe(false);
	});

	test.each([
		['title', ''],
		['description', 5],
		['date', 'soon'],
		['startTime', '09:00'],
		['startTime', 1440],
		['duration', 4],
		['duration', 7.5],
		['priority', 6],
		['status', 'active']
	])('rejects %s of %p', (field, value) => {
		expect(parseTaskInput({ id: 3, [field]: value }, 'update').ok).toBe(false);
	});

	test('a start and a duration that cross midnight together are rejected', () => {
		expect(parseTaskInput({ id: 3, startTime: 1400, duration: 120 }, 'update').ok).toBe(false);
	});
});

describe('fitsInDay and parseTaskId', () => {
	test('fitsInDay is end inclusive at midnight', () => {
		expect(fitsInDay({ startTime: 1400, duration: 40 })).toBe(true);
		expect(fitsInDay({ startTime: 1400, duration: 41 })).toBe(false);
	});

	test.each([
		[4, 4],
		['4', undefined],
		[1.5, undefined],
		[null, undefined]
	])('parseTaskId of %p is %p', (value, expected) => {
		expect(parseTaskId(value)).toBe(expected);
	});
});

describe('properties', () => {
	const maybe = (plausible: fc.Arbitrary<unknown>) =>
		fc.oneof({ weight: 9, arbitrary: plausible }, { weight: 1, arbitrary: fc.jsonValue() });
	const body = fc.record(
		{
			title: maybe(fc.string({ maxLength: 220 })),
			description: maybe(fc.string({ maxLength: 1200 })),
			date: maybe(fc.constantFrom('2026-10-14', '2026-02-30', '2027-01-01')),
			startTime: maybe(fc.integer({ min: -10, max: 1500 })),
			duration: maybe(fc.integer({ min: -10, max: 1600 })),
			priority: maybe(fc.integer({ min: -1, max: 7 })),
			status: maybe(fc.constantFrom('pending', 'completed', 'active'))
		},
		{ requiredKeys: ['title', 'date', 'startTime', 'duration', 'priority'] }
	);

	test('never throws, and an accepted task is whole and never crosses midnight', () => {
		fc.assert(
			fc.property(fc.oneof(body, fc.jsonValue()), (value) => {
				const parsed = parseTaskInput(value, 'create');
				if (!parsed.ok) return;
				const task = parsed.value;
				expect(task.title).toBe(task.title!.trim());
				expect(task.title!.length).toBeGreaterThan(0);
				expect(isDateKey(task.date)).toBe(true);
				expect(task.startTime! + task.duration!).toBeLessThanOrEqual(1440);
				expect(task.duration).toBeGreaterThanOrEqual(5);
				expect([1, 2, 3, 4, 5]).toContain(task.priority!);
			})
		);
	});

	test('an accepted update holds only valid fields', () => {
		fc.assert(
			fc.property(body, (value) => {
				const parsed = parseTaskInput(value, 'update');
				if (!parsed.ok) return;
				const { startTime, priority, status } = parsed.value;
				if (startTime !== undefined) expect(startTime).toBeLessThan(1440);
				if (priority !== undefined) expect([1, 2, 3, 4, 5]).toContain(priority);
				if (status !== undefined) expect(['pending', 'completed']).toContain(status);
			})
		);
	});
});
