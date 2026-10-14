/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_REACTION_EVENTS, LIMITS, decideReaction, inQuietHours, parseSettingsForm, type ReactionContext } from './guardrails';

const context = (patch: Partial<ReactionContext> = {}, settings: Partial<ReactionContext['settings']> = {}): ReactionContext => ({
	settings: { autonomy: 'suggest', events: [...DEFAULT_REACTION_EVENTS], quietStart: 22 * 60, quietEnd: 7 * 60, dailyTokenBudget: null, ...settings },
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

	test('stays silent for each guardrail', () => {
		const reason = (c: ReactionContext, types = ['task.missed'] as const) => {
			const decision = decideReaction(c, [...types]);
			return decision.run ? null : decision.reason;
		};
		expect(reason(context({}, { autonomy: 'observe' }))).toBe('autonomy is observe');
		expect(reason(context({ hasKey: false }))).toBe('no OpenAI key');
		expect(reason(context(), ['task.created'] as never)).toBe('event type is switched off');
		expect(reason(context({ now: 23 * 60 }))).toBe('quiet hours');
		expect(reason(context({ tokensToday: 5000 }, { dailyTokenBudget: 5000 }))).toBe('daily token budget used up');
		const many = Array.from({ length: LIMITS.perHour }, (_, i) => 1_000_000_000 - (i + 10) * 60_000);
		expect(reason(context({ recentReactions: many }))).toBe('hourly limit reached');
		expect(reason(context({ recentReactions: [1_000_000_000 - 60_000] }))).toBe('too soon after the last reaction');
	});

	test('one enabled type in a batch is enough', () => {
		expect(decideReaction(context(), ['task.created', 'task.completed']).run).toBe(true);
	});
});

describe('parseSettingsForm', () => {
	const form = (entries: [string, string][]) => {
		const data = new FormData();
		for (const [key, value] of entries) data.append(key, value);
		return data;
	};
	const base: [string, string][] = [['autonomy', 'act'], ['quietStart', '22:30'], ['quietEnd', '06:45']];

	test('reads a valid form', () => {
		const result = parseSettingsForm(form([...base, ['event', 'task.missed'], ['event', 'bogus'], ['event', 'user.message'], ['budget', '50']]));
		expect(result).toEqual({ ok: true, value: { autonomy: 'act', events: ['task.missed'], quietStart: 1350, quietEnd: 405, dailyTokenBudget: 50_000 } });
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
