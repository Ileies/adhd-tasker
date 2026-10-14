/**
 * The settings the forms on /settings change. One patch shape and one validator, so the client
 * checks before it sends and the server checks again with the same rules.
 */
import { OVERRUN_LIMITS, REMINDER_LIMITS, type AnchoringSettings } from '#lib/anchoring.js';
import { isEventType } from '#lib/events.js';
import { isAutonomy, type AgentSettings } from '#lib/guardrails.js';
import type { Settings } from '#lib/core/repo.js';

/** What the page may know: everything but the key itself, which only says whether one is saved. */
export type ClientSettings = Omit<Settings, 'openaiKey'> & { hasOpenaiKey: boolean };

export function clientSettings({ openaiKey, ...rest }: Settings): ClientSettings {
	return { ...rest, hasOpenaiKey: !!openaiKey };
}

export type SettingsPatch = Partial<
	Pick<
		Settings,
		| 'enableReminders'
		| 'reminderAdvanceTime'
		| 'hyperfocusAlarm'
		| 'overrunMinutes'
		| 'aiAutonomy'
		| 'aiEvents'
		| 'quietStart'
		| 'quietEnd'
		| 'dailyTokenBudget'
		| 'voiceReplies'
		| 'showClock'
	>
>;

const isBool = (value: unknown) => typeof value === 'boolean';
const inRange = (min: number, max: number) => (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const isClock = inRange(0, 1439);

/** Not every event type is a toggle, but the stored list only has to name real types. */
const isEventList = (value: unknown) =>
	typeof value === 'string' && value.split(' ').every((part) => part === '' || isEventType(part));

const isBudget = (value: unknown) => value === null || inRange(1000, 100_000_000)(value);

const VALID: Record<keyof SettingsPatch, (value: unknown) => boolean> = {
	enableReminders: isBool,
	reminderAdvanceTime: inRange(REMINDER_LIMITS.min, REMINDER_LIMITS.max),
	hyperfocusAlarm: isBool,
	overrunMinutes: inRange(OVERRUN_LIMITS.min, OVERRUN_LIMITS.max),
	aiAutonomy: isAutonomy,
	aiEvents: isEventList,
	quietStart: isClock,
	quietEnd: isClock,
	dailyTokenBudget: isBudget,
	voiceReplies: isBool,
	showClock: isBool
};

/** A patch from the outside: known keys only, every value in range, at least one key. */
export function parseSettingsPatch(
	body: unknown
): { ok: true; value: SettingsPatch } | { ok: false; error: string } {
	if (typeof body !== 'object' || body === null || Array.isArray(body))
		return { ok: false, error: 'Send an object of settings' };
	const entries = Object.entries(body);
	if (entries.length === 0) return { ok: false, error: 'Nothing to save' };
	for (const [key, value] of entries) {
		const valid = VALID[key as keyof SettingsPatch];
		if (!Object.hasOwn(VALID, key) || !valid) return { ok: false, error: `Unknown setting ${key}` };
		if (!valid(value)) return { ok: false, error: `Invalid value for ${key}` };
	}
	return { ok: true, value: body as SettingsPatch };
}

export const anchoringPatch = (value: AnchoringSettings): SettingsPatch => ({ ...value });

export const agentPatch = (value: AgentSettings): SettingsPatch => ({
	aiAutonomy: value.autonomy,
	aiEvents: value.events.join(' '),
	quietStart: value.quietStart,
	quietEnd: value.quietEnd,
	dailyTokenBudget: value.dailyTokenBudget
});
