/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { parseQuickTask, quickPreview, quickTask } from '#lib/quickadd.js';

describe('quickTask', () => {
	const DAY = '2026-10-14';

	test('a line without a title makes no task', () => {
		expect(quickTask('  14:30 45m ', DAY, 600)).toBeNull();
	});

	test('uses the time and the duration the line names', () => {
		expect(quickTask('Call dentist 14:30 45m', DAY, 600)).toMatchObject({
			title: 'Call dentist',
			date: DAY,
			startTime: 14 * 60 + 30,
			duration: 45
		});
	});

	test('today a task without a time starts at the next free quarter hour', () => {
		expect(quickTask('Buy milk', DAY, 9 * 60 + 1)?.startTime).toBe(9 * 60 + 15);
		expect(quickTask('Buy milk', DAY, 9 * 60)?.startTime).toBe(9 * 60);
	});

	test('on another day a task without a time starts at 09:00 and lasts 30 minutes', () => {
		expect(quickTask('Buy milk', DAY, null)).toMatchObject({ startTime: 540, duration: 30 });
	});

	test('late in the evening the task still ends before midnight', () => {
		const late = quickTask('Buy milk', DAY, 23 * 60 + 50)!;
		expect(late.startTime + late.duration).toBeLessThanOrEqual(1440);
		const long = quickTask('Plan 23:30 2h', DAY, null)!;
		expect(long.startTime + long.duration).toBeLessThanOrEqual(1440);
	});
});

describe('parseQuickTask', () => {
	test('title only', () => {
		expect(parseQuickTask('Buy milk')).toEqual({
			title: 'Buy milk',
			startTime: null,
			duration: null
		});
	});

	test('24 hour time and minutes', () => {
		expect(parseQuickTask('Call dentist 14:30 45m')).toEqual({
			title: 'Call dentist',
			startTime: 870,
			duration: 45
		});
	});

	test('meridiem times', () => {
		expect(parseQuickTask('Dinner 7pm 2h').startTime).toBe(1140);
		expect(parseQuickTask('Standup 12am').startTime).toBe(0);
		expect(parseQuickTask('Lunch 12:15pm').startTime).toBe(735);
	});

	test('at hour and for duration wording', () => {
		expect(parseQuickTask('Study at 18 for 1.5h')).toEqual({
			title: 'Study',
			startTime: 1080,
			duration: 90
		});
	});

	test('combined hours and minutes are one duration, not a time', () => {
		expect(parseQuickTask('Gym 1h30m')).toEqual({ title: 'Gym', startTime: null, duration: 90 });
	});

	test('numbers inside the title survive', () => {
		expect(parseQuickTask('Read chapter 4 at 9:00').title).toBe('Read chapter 4');
	});
});

describe('properties', () => {
	// Plain text, and text built from the pieces the parser looks for, so the interesting paths are hit
	const piece = fc.oneof(
		fc.string({ maxLength: 12 }),
		fc.constantFrom(
			'at',
			'for',
			'am',
			'pm',
			'h',
			'm',
			':',
			'.',
			',',
			' ',
			'14:30',
			'2pm',
			'1h30m',
			'1.5h',
			'45m'
		)
	);
	const text = fc.oneof(
		fc.string({ unit: 'grapheme', maxLength: 60 }),
		fc.array(piece, { maxLength: 8 }).map((parts) => parts.join(' '))
	);

	test('never throws, the title is trimmed and the numbers make sense', () => {
		fc.assert(
			fc.property(text, (input) => {
				const { title, startTime, duration } = parseQuickTask(input);
				expect(title).toBe(title.trim());
				if (startTime !== null) {
					expect(Number.isInteger(startTime)).toBe(true);
					expect(startTime).toBeGreaterThanOrEqual(0);
					expect(startTime).toBeLessThan(1440);
				}
				if (duration !== null) {
					expect(Number.isFinite(duration)).toBe(true);
					expect(duration).toBeGreaterThan(0);
				}
			})
		);
	});
});

describe('quickPreview', () => {
	test('says the time and duration without repeating the title', () => {
		expect(quickPreview('Call dentist 14:30 45m', '2026-10-14', null)).toBe('14:30 to 15:15, 45m');
	});

	test('a duration alone uses the next free quarter hour today', () => {
		expect(quickPreview('Groceries 20m', '2026-10-14', 601)).toBe('10:15 to 10:35, 20m');
	});

	test('is null when the line names neither a time nor a duration', () => {
		expect(quickPreview('Groceries', '2026-10-14', 601)).toBeNull();
	});

	test('is null without a title', () => {
		expect(quickPreview('14:30 45m', '2026-10-14', null)).toBeNull();
	});
});
