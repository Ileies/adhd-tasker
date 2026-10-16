/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	BREAK_ACTIVITIES,
	activityById,
	breakActivity,
	isMeal,
	type BreakChoice
} from '#lib/breaks.js';

const choice = (patch: Partial<BreakChoice> = {}): BreakChoice => ({
	minutes: 10,
	recent: [],
	next: null,
	daylight: true,
	seed: 0,
	...patch
});

describe('the library', () => {
	test('every activity has its own id and says what to do', () => {
		expect(new Set(BREAK_ACTIVITIES.map((activity) => activity.id)).size).toBe(
			BREAK_ACTIVITIES.length
		);
		for (const activity of BREAK_ACTIVITIES) expect(activity.text.length).toBeGreaterThan(10);
	});

	test('no activity needs the screen', () => {
		for (const activity of BREAK_ACTIVITIES)
			expect(activity.text.toLowerCase()).not.toMatch(/screen time|scroll|watch a video/);
	});

	test('an id of a newer version still shows something', () => {
		expect(activityById('water').id).toBe('water');
		expect(activityById('gone').id).toBe(BREAK_ACTIVITIES[0].id);
		expect(activityById(null).id).toBe(BREAK_ACTIVITIES[0].id);
	});
});

describe('breakActivity', () => {
	test('the seed picks among what fits, the same seed gives the same activity', () => {
		expect(breakActivity(choice({ seed: 3 })).id).toBe(breakActivity(choice({ seed: 3 })).id);
		const ids = new Set(
			Array.from(
				{ length: BREAK_ACTIVITIES.length },
				(_, seed) => breakActivity(choice({ seed })).id
			)
		);
		expect(ids.size).toBeGreaterThan(3);
	});

	test('never the same twice in a row', () => {
		for (const last of BREAK_ACTIVITIES)
			for (let seed = 0; seed < 20; seed++)
				expect(breakActivity(choice({ seed, recent: ['x', last.id] })).id).not.toBe(last.id);
	});

	test('nothing with food when a meal is within 45 minutes', () => {
		const lunch = { title: 'Lunch', inMinutes: 40 };
		for (let seed = 0; seed < 20; seed++)
			expect(breakActivity(choice({ seed, next: lunch })).food).toBeUndefined();
		const meeting = { title: 'Meeting', inMinutes: 40 };
		const withFood = Array.from({ length: 20 }, (_, seed) =>
			breakActivity(choice({ seed, next: meeting }))
		).some((activity) => activity.food);
		expect(withFood).toBe(true);
	});

	test('a meal further away does not matter', () => {
		const far = { title: 'Dinner', inMinutes: 120 };
		const some = Array.from({ length: 20 }, (_, seed) =>
			breakActivity(choice({ seed, next: far }))
		).some((activity) => activity.food);
		expect(some).toBe(true);
	});

	test('no walk around the block in the dark', () => {
		for (let seed = 0; seed < 20; seed++)
			expect(breakActivity(choice({ seed, daylight: false })).outdoors).toBeUndefined();
		const walks = Array.from({ length: 20 }, (_, seed) => breakActivity(choice({ seed }))).some(
			(activity) => activity.outdoors
		);
		expect(walks).toBe(true);
	});

	test('no walk in a short break or one that would run into the next item', () => {
		for (let seed = 0; seed < 20; seed++) {
			expect(breakActivity(choice({ seed, minutes: 5 })).outdoors).toBeUndefined();
			const near = { title: 'Meeting', inMinutes: 12 };
			expect(breakActivity(choice({ seed, next: near })).outdoors).toBeUndefined();
		}
	});

	test('there is always one, for any seed', () => {
		for (const seed of [-7, 0, 1, 99, 2 ** 31, 12.9])
			expect(breakActivity(choice({ seed })).text).not.toBe('');
	});
});

describe('isMeal', () => {
	test.each([
		['Lunch', true],
		['Dinner with Sam', true],
		['Have breakfast', true],
		['Meeting', false],
		['Lunchtime call with the dentist', false]
	])('%s: %p', (title, meal) => {
		expect(isMeal(title)).toBe(meal);
	});
});
