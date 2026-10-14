/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
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
