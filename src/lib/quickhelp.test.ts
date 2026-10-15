/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { QUICK_RULES, quickOutcome, type QuickMode } from '#lib/quickhelp.js';

const rules = (Object.keys(QUICK_RULES) as QuickMode[]).flatMap((mode) =>
	QUICK_RULES[mode].map((rule) => [mode, rule.name, rule.example] as const)
);

describe('quick add help', () => {
	test.each(rules)('the %s example "%s" (%s) makes something', (mode, _name, example) => {
		expect(quickOutcome(mode, example)).not.toBeNull();
	});

	test.each([
		['task', 'Call dentist 14:30', 'Call dentist', '14:30 to 15:00, 30m'],
		['task', 'Water the plants', 'Water the plants', 'Next free quarter hour, 30m'],
		['alarm', 'Tea in 5 min', 'Tea', 'Rings in 5 min'],
		['alarm', 'Gym 7am Wed-Fri', 'Gym', 'Rings at 07:00 (Wed to Fri)']
	] as const)('%s "%s" says what it makes', (mode, text, title, when) => {
		expect(quickOutcome(mode, text)).toEqual({ title, when });
	});

	test('an alarm line without a time makes nothing', () => {
		expect(quickOutcome('alarm', 'Meds')).toBeNull();
	});

	test('an empty task line makes nothing', () => {
		expect(quickOutcome('task', '  ')).toBeNull();
	});
});
