/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { defaultTimes, ESSENTIAL_KEYS, ESSENTIALS, essentialRoutines } from '#lib/essentials.js';
import { parseRoutineInput } from '#lib/routine-input.js';
import { DAY_MINUTES } from '#lib/plan.js';

describe('essentialRoutines', () => {
	test('the default times make a daily routine for every essential', () => {
		const routines = essentialRoutines(defaultTimes());
		expect(routines.map((routine) => routine.title)).toEqual(ESSENTIALS.map(({ title }) => title));
		expect(routines.every((routine) => routine.repeat === 'daily')).toBe(true);
	});

	test('every routine passes the routine validator', () => {
		for (const routine of essentialRoutines(defaultTimes()))
			expect(parseRoutineInput(routine, 'create').ok).toBe(true);
	});

	test('meals may move for an appointment, meds and bed stay', () => {
		const shifts = Object.fromEntries(
			essentialRoutines(defaultTimes()).map((routine) => [routine.title, routine.shift])
		);
		expect(shifts).toEqual({ Meds: 0, Breakfast: 60, Lunch: 60, Dinner: 60, 'Go to bed': 0 });
	});

	test('an essential without a time or with null is left out', () => {
		const routines = essentialRoutines({ lunch: 13 * 60, dinner: null });
		expect(routines.map((routine) => [routine.title, routine.startTime])).toEqual([
			['Lunch', 13 * 60]
		]);
	});

	test('a time too late for the length moves back so the day ends at midnight', () => {
		const [bed] = essentialRoutines({ bed: DAY_MINUTES - 1 });
		expect(bed.startTime! + bed.duration!).toBe(DAY_MINUTES);
	});

	test('the default times do not overlap and are in the day', () => {
		const sorted = ESSENTIALS.toSorted((a, b) => a.time - b.time);
		for (const [index, essential] of sorted.entries()) {
			expect(essential.time + essential.duration).toBeLessThanOrEqual(DAY_MINUTES);
			if (index > 0)
				expect(essential.time).toBeGreaterThanOrEqual(
					sorted[index - 1].time + sorted[index - 1].duration
				);
		}
	});

	test('the keys and the list agree', () => {
		expect(ESSENTIALS.map(({ key }) => key)).toEqual([...ESSENTIAL_KEYS]);
	});
});
