/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { dueWords, takeDate } from '#lib/dates.js';
import { addDays } from '#lib/time.js';

// A Wednesday
const TODAY = '2026-10-14';
const dateOf = (text: string, today = TODAY) => takeDate(text, today).date;

describe('takeDate', () => {
	test.each([
		['today', 'Call mum today', '2026-10-14'],
		['tomorrow', 'Call mum tomorrow', '2026-10-15'],
		['a weekday later this week', 'Report friday', '2026-10-16'],
		['the same weekday is in a week', 'Report wednesday', '2026-10-21'],
		['next and a weekday', 'Report next monday', '2026-10-19'],
		['a short weekday with by', 'Report by fri', '2026-10-16'],
		['a short weekday alone is just a word', 'Report fri', null],
		['month and day', 'Study Math Nov 5', '2026-11-05'],
		['a full month and an ordinal', 'Study Math november 5th', '2026-11-05'],
		['day and month', 'Study Math 5 Nov', '2026-11-05'],
		['a past day means next year', 'Taxes Oct 2', '2027-10-02'],
		['today as a month and day stays', 'Taxes Oct 14', '2026-10-14'],
		['dotted', 'Study Math 5.11.', '2026-11-05'],
		['dotted needs the closing dot', 'Study Math 5.11', null],
		['a length is not a date', 'Write intro 1.5h', null],
		['iso', 'Study Math 2026-12-24', '2026-12-24'],
		['in days', 'Report in 20 days', '2026-11-03'],
		['in weeks', 'Report in 3 weeks', '2026-11-04'],
		['an impossible day', 'Report Feb 30', null],
		['no date', 'Buy milk', null],
		['may without a day is a word', 'You may start', null]
	])('%s', (_name, text, date) => {
		expect(dateOf(text)).toBe(date);
	});

	test('a lead word goes with the date out of the title', () => {
		expect(takeDate('Study Math due Nov 5', TODAY).rest.replace(/\s+/g, ' ').trim()).toBe(
			'Study Math'
		);
		expect(takeDate('Report by friday please', TODAY).rest.replace(/\s+/g, ' ').trim()).toBe(
			'Report please'
		);
	});

	test('text without a date comes back as it was', () => {
		expect(takeDate('Buy milk', TODAY)).toEqual({ date: null, rest: 'Buy milk' });
	});

	test('Feb 29 finds the next leap year', () => {
		expect(dateOf('Party Feb 29', '2026-10-14')).toBe('2028-02-29');
	});

	test('a date is never in the past', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 800 }),
				fc.constantFrom(
					'jan',
					'feb',
					'mar',
					'apr',
					'may',
					'jun',
					'jul',
					'aug',
					'sep',
					'oct',
					'nov',
					'dec'
				),
				fc.integer({ min: 1, max: 31 }),
				(offset, month, day) => {
					const today = addDays(TODAY, offset);
					const date = takeDate(`x ${month} ${day}`, today).date;
					if (date !== null) expect(date >= today).toBe(true);
				}
			)
		);
	});
});

describe('dueWords', () => {
	test.each([
		['2026-10-13', 'overdue'],
		['2026-10-14', 'today'],
		['2026-10-15', 'tomorrow'],
		['2026-10-26', 'in 12 days']
	])('%s is %s', (due, words) => {
		expect(dueWords(due, TODAY)).toBe(words);
	});
});
