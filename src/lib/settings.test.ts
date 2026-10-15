/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import {
	BUDGET_PRESETS,
	CHECK_IN_PRESETS,
	HEADS_UP_PRESETS,
	OVERRUN_PRESETS,
	agentPatch,
	budgetChip,
	minutesChip,
	parseSettingsPatch,
	type SettingsPatch,
	withCurrent
} from '#lib/settings.js';

describe('parseSettingsPatch', () => {
	test('accepts valid values for each kind of setting', () => {
		const patch: SettingsPatch = {
			enableReminders: true,
			reminderAdvanceTime: 10,
			overrunMinutes: 20,
			aiAutonomy: 'act',
			aiEvents: 'task.completed task.missed',
			quietStart: 1320,
			quietEnd: 420,
			dailyTokenBudget: null,
			voiceReplies: false,
			openaiTranscribe: true,
			showClock: true
		};
		expect(parseSettingsPatch(patch)).toEqual({ ok: true, value: patch });
	});

	test.each([
		['not an object', 'x'],
		['an array', []],
		['null', null],
		['empty', {}],
		['an unknown key', { openaiKey: 'x' }],
		['an inherited key', { toString: 1 }],
		['a minute count below the limit', { reminderAdvanceTime: 0 }],
		['a minute count above the limit', { overrunMinutes: 121 }],
		['a fractional number', { quietStart: 1.5 }],
		['a clock time past midnight', { quietEnd: 1440 }],
		['an unknown autonomy', { aiAutonomy: 'free' }],
		['an unknown event', { aiEvents: 'task.completed nope' }],
		['a budget below 1000 tokens', { dailyTokenBudget: 10 }],
		['a string for a switch', { showClock: 'true' }],
		['a negative check-in', { checkInMinutes: -5 }],
		['a check-in over an hour', { checkInMinutes: 90 }],
		['a My day start past midnight', { myDayStart: 1440 }],
		['a My day end of zero', { myDayEnd: 0 }],
		['a My day shorter than an hour', { myDayStart: 600, myDayEnd: 630 }],
		['a My day that ends before it starts', { myDayStart: 900, myDayEnd: 600 }]
	])('rejects %s', (_name, body) => {
		expect(parseSettingsPatch(body).ok).toBe(false);
	});
});

describe('check-in and My day', () => {
	test('the chime can be off and My day can end at midnight', () => {
		const patch: SettingsPatch = { checkInMinutes: 0, myDayStart: 360, myDayEnd: 1440 };
		expect(parseSettingsPatch(patch)).toEqual({ ok: true, value: patch });
	});
});

describe('patches from the forms', () => {
	test('the agent settings use the stored names, events as one string', () => {
		expect(
			agentPatch({
				autonomy: 'suggest',
				events: ['task.completed', 'task.missed'],
				quietStart: 1320,
				quietEnd: 420,
				dailyTokenBudget: 5000
			})
		).toEqual({
			aiAutonomy: 'suggest',
			aiEvents: 'task.completed task.missed',
			quietStart: 1320,
			quietEnd: 420,
			dailyTokenBudget: 5000
		});
	});
});

describe('presets', () => {
	test('every preset is a valid setting', () => {
		for (const value of HEADS_UP_PRESETS)
			expect(parseSettingsPatch({ reminderAdvanceTime: value }).ok).toBe(true);
		for (const value of OVERRUN_PRESETS)
			expect(parseSettingsPatch({ overrunMinutes: value }).ok).toBe(true);
		for (const value of CHECK_IN_PRESETS)
			expect(parseSettingsPatch({ checkInMinutes: value }).ok).toBe(true);
		for (const value of BUDGET_PRESETS)
			expect(parseSettingsPatch({ dailyTokenBudget: value }).ok).toBe(true);
	});

	test('the default of each setting is one of its presets', () => {
		expect(HEADS_UP_PRESETS).toContain(DEFAULT_SETTINGS.reminderAdvanceTime);
		expect(OVERRUN_PRESETS).toContain(DEFAULT_SETTINGS.overrunMinutes);
		expect(CHECK_IN_PRESETS).toContain(DEFAULT_SETTINGS.checkInMinutes);
	});

	test('a stored value that is no preset joins the choices in order', () => {
		expect(withCurrent([5, 10, 15, 30], 20)).toEqual([5, 10, 15, 20, 30]);
		expect(withCurrent([5, 10, 15, 30], 10)).toEqual([5, 10, 15, 30]);
	});

	test.each<[number, string]>([
		[0, 'Off'],
		[5, '5 min'],
		[60, '1 h'],
		[90, '90 min']
	])('%d minutes reads %s', (minutes, text) => {
		expect(minutesChip(minutes)).toBe(text);
	});

	test.each<[number | null, string]>([
		[null, 'No limit'],
		[50_000, '50k'],
		[200_000, '200k'],
		[1_500_000, '1.5M']
	])('a budget of %s reads %s', (tokens, text) => {
		expect(budgetChip(tokens)).toBe(text);
	});
});

describe('location', () => {
	const place: SettingsPatch = {
		locationLat: 51.34,
		locationLon: 12.37,
		locationName: 'Leipzig',
		locationSource: 'city'
	};
	const cleared: SettingsPatch = {
		locationLat: null,
		locationLon: null,
		locationName: null,
		locationSource: null
	};

	test.each([
		['a city', place],
		['a position from the device', { ...place, locationSource: 'device' }],
		['detect automatically, all four cleared', cleared]
	] as const)('accepts %s', (_name, patch) => {
		expect(parseSettingsPatch(patch)).toEqual({ ok: true, value: patch });
	});

	test.each([
		['a latitude beyond the poles', { ...place, locationLat: 90.5 }],
		['a longitude beyond the date line', { ...place, locationLon: -181 }],
		['a latitude that is not finite', { ...place, locationLat: Number.NaN }],
		['a latitude as text', { ...place, locationLat: '51.34' }],
		['an empty name', { ...place, locationName: ' ' }],
		['a name that is too long', { ...place, locationName: 'x'.repeat(101) }],
		['a source the server alone may write', { ...place, locationSource: 'ip' }],
		['an unknown source', { ...place, locationSource: 'gps' }],
		['only the position', { locationLat: 51.34, locationLon: 12.37 }],
		['a place without its source', { ...place, locationSource: null }],
		['a cleared name with a position', { ...cleared, locationLat: 51.34 }]
	])('rejects %s', (_name, body) => {
		expect(parseSettingsPatch(body).ok).toBe(false);
	});

	test('a patch without any location keeps working', () => {
		expect(parseSettingsPatch({ showClock: true }).ok).toBe(true);
	});
});
