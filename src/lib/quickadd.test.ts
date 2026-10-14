/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { parseQuickTask } from '#lib/quickadd.js';

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
