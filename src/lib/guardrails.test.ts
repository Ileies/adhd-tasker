/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import {
	DEFAULT_REACTION_EVENTS,
	LIMITS,
	REACTION_EVENTS,
	decideReaction,
	inQuietHours,
	parseEvents,
	parseSettingsForm,
	type ReactionContext
} from '#lib/guardrails.js';

const context = (
	patch: Partial<ReactionContext> = {},
	settings: Partial<ReactionContext['settings']> = {}
): ReactionContext => ({
	settings: {
		autonomy: 'suggest',
		events: [...DEFAULT_REACTION_EVENTS],
		quietStart: 22 * 60,
		quietEnd: 7 * 60,
		dailyTokenBudget: null,
		...settings
	},
	hasKey: true,
	now: 12 * 60,
	nowMs: 1_000_000_000,
	recentReactions: [],
	tokensToday: 0,
	...patch
});

describe('inQuietHours', () => {
	test('handles a window over midnight', () => {
		expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true);
		expect(inQuietHours(3 * 60, 22 * 60, 7 * 60)).toBe(true);
		expect(inQuietHours(12 * 60, 22 * 60, 7 * 60)).toBe(false);
		expect(inQuietHours(7 * 60, 22 * 60, 7 * 60)).toBe(false);
	});

	test('handles a window inside one day and an empty one', () => {
		expect(inQuietHours(13 * 60, 12 * 60, 14 * 60)).toBe(true);
		expect(inQuietHours(15 * 60, 12 * 60, 14 * 60)).toBe(false);
		expect(inQuietHours(3, 0, 0)).toBe(false);
	});
});

describe('decideReaction', () => {
	test('runs when nothing holds it back', () => {
		expect(decideReaction(context(), ['task.missed'])).toEqual({ run: true });
	});

	test('"I\'m stuck" ignores toggles, quiet hours, budget and the gap, but not autonomy, key or the hourly limit', () => {
		const stuck = ['stuck.pressed'] as const;
		const busy = context(
			{ now: 23 * 60, tokensToday: 9000, recentReactions: [1_000_000_000 - 1000] },
			{ dailyTokenBudget: 5000, events: [] }
		);
		expect(decideReaction(busy, [...stuck])).toEqual({ run: true });
		expect(decideReaction({ ...busy, hasKey: false }, [...stuck]).run).toBe(false);
		expect(
			decideReaction({ ...busy, settings: { ...busy.settings, autonomy: 'observe' } }, [...stuck])
				.run
		).toBe(false);
		const many = Array.from(
			{ length: LIMITS.perHour },
			(_, i) => 1_000_000_000 - (i + 10) * 60_000
		);
		expect(decideReaction({ ...busy, recentReactions: many }, [...stuck]).run).toBe(false);
	});

	test('stays silent for each guardrail', () => {
		const reason = (c: ReactionContext, types = ['task.missed'] as const) => {
			const decision = decideReaction(c, [...types]);
			return decision.run ? null : decision.reason;
		};
		expect(reason(context({}, { autonomy: 'observe' }))).toBe('autonomy is observe');
		expect(reason(context({ hasKey: false }))).toBe('no OpenAI key');
		expect(reason(context(), ['task.created'] as never)).toBe('event type is switched off');
		expect(reason(context({ now: 23 * 60 }))).toBe('quiet hours');
		expect(reason(context({ tokensToday: 5000 }, { dailyTokenBudget: 5000 }))).toBe(
			'daily token budget used up'
		);
		const many = Array.from(
			{ length: LIMITS.perHour },
			(_, i) => 1_000_000_000 - (i + 10) * 60_000
		);
		expect(reason(context({ recentReactions: many }))).toBe('hourly limit reached');
		expect(reason(context({ recentReactions: [1_000_000_000 - 60_000] }))).toBe(
			'too soon after the last reaction'
		);
	});

	test('one enabled type in a batch is enough', () => {
		expect(decideReaction(context(), ['task.created', 'task.completed']).run).toBe(true);
	});
});

describe('wakeups', () => {
	test('a wakeup needs no toggle but obeys every other guardrail', () => {
		expect(decideReaction(context(), ['wakeup.fired'])).toEqual({ run: true });
		expect(decideReaction(context({}, { events: [] }), ['wakeup.fired'])).toEqual({ run: true });
		expect(decideReaction(context({ now: 23 * 60 }), ['wakeup.fired'])).toEqual({
			run: false,
			reason: 'quiet hours'
		});
		expect(decideReaction(context({}, { autonomy: 'observe' }), ['wakeup.fired'])).toEqual({
			run: false,
			reason: 'autonomy is observe'
		});
		expect(
			decideReaction(
				context({ recentReactions: Array(LIMITS.perHour).fill(1_000_000_000 - 3_600_000) }),
				['wakeup.fired']
			).run
		).toBe(false);
	});

	test('an appointment without preparation and a rotation are toggles, and on by default', () => {
		for (const type of ['appointment.added', 'focus.rotated'] as const) {
			expect(REACTION_EVENTS).toContain(type);
			expect(DEFAULT_REACTION_EVENTS).toContain(type);
		}
		expect(DEFAULT_REACTION_EVENTS).toEqual(parseEvents(DEFAULT_SETTINGS.aiEvents));
	});

	test('the rest of the to-do events stay logged only, every event of the to-do list is no toggle', () => {
		for (const type of [
			'todo.created',
			'todo.updated',
			'todo.completed',
			'todo.deleted',
			'todo.ended'
		])
			expect(REACTION_EVENTS).not.toContain(type);
	});

	test('a rotation reacts when switched on, and is silent when the user switched it off', () => {
		const on = context({}, { events: ['focus.rotated'] });
		expect(decideReaction(on, ['focus.rotated']).run).toBe(true);
		const off = context({}, { events: ['task.missed'] });
		expect(decideReaction(off, ['focus.rotated'])).toEqual({
			run: false,
			reason: 'event type is switched off'
		});
	});

	test('alarms and wakeups are not offered as toggles', () => {
		expect(REACTION_EVENTS).not.toContain('wakeup.fired');
		expect(REACTION_EVENTS).not.toContain('alarm.fired');
		const form = new FormData();
		form.set('autonomy', 'suggest');
		form.set('quietStart', '22:00');
		form.set('quietEnd', '07:00');
		form.append('event', 'alarm.fired');
		form.append('event', 'task.missed');
		const result = parseSettingsForm(form);
		expect(result.ok && result.value.events).toEqual(['task.missed']);
	});
});

describe('parseSettingsForm', () => {
	const form = (entries: [string, string][]) => {
		const data = new FormData();
		for (const [key, value] of entries) data.append(key, value);
		return data;
	};
	const base: [string, string][] = [
		['autonomy', 'act'],
		['quietStart', '22:30'],
		['quietEnd', '06:45']
	];

	test('reads a valid form', () => {
		const result = parseSettingsForm(
			form([
				...base,
				['event', 'task.missed'],
				['event', 'bogus'],
				['event', 'user.message'],
				['budget', '50']
			])
		);
		expect(result).toEqual({
			ok: true,
			value: {
				autonomy: 'act',
				events: ['task.missed'],
				quietStart: 1350,
				quietEnd: 405,
				dailyTokenBudget: 50_000
			}
		});
	});

	test('an empty budget means no limit', () => {
		const result = parseSettingsForm(form(base));
		expect(result.ok && result.value.dailyTokenBudget).toBe(null);
	});

	test('rejects bad input', () => {
		expect(parseSettingsForm(form([['autonomy', 'wild'], ...base.slice(1)])).ok).toBe(false);
		expect(parseSettingsForm(form([base[0], ['quietStart', '25:00'], base[2]])).ok).toBe(false);
		expect(parseSettingsForm(form([...base, ['budget', '-3']])).ok).toBe(false);
	});
});

describe('parseEvents', () => {
	test('keeps known types in order and drops junk', () => {
		expect(parseEvents('task.missed bogus task.completed  ')).toEqual([
			'task.missed',
			'task.completed'
		]);
	});

	test('an empty string means no events', () => {
		expect(parseEvents('')).toEqual([]);
	});
});
