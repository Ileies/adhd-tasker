/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	agentPatch,
	anchoringPatch,
	parseSettingsPatch,
	type SettingsPatch
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
		['a string for a switch', { showClock: 'true' }]
	])('rejects %s', (_name, body) => {
		expect(parseSettingsPatch(body).ok).toBe(false);
	});
});

describe('patches from the forms', () => {
	test('the anchoring settings are already a patch', () => {
		const value = {
			enableReminders: true,
			reminderAdvanceTime: 5,
			hyperfocusAlarm: false,
			overrunMinutes: 15
		};
		expect(anchoringPatch(value)).toEqual(value);
	});

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
