/**
 * The settings the forms on /settings change. One patch shape and one validator, so the client
 * checks before it sends and the server checks again with the same rules.
 */
import { OVERRUN_LIMITS, REMINDER_LIMITS } from '#lib/anchoring.js';
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
		| 'openaiTranscribe'
		| 'showClock'
		| 'clock12h'
		| 'checkInMinutes'
		| 'myDayStart'
		| 'myDayEnd'
	>
>;

/** The check-in chime in minutes, 0 is off. */
export const CHECK_IN_MAX = 60;
/** My day has to span at least this many minutes, or the timeline has nothing to show. */
export const MY_DAY_MIN = 60;

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
	openaiTranscribe: isBool,
	showClock: isBool,
	clock12h: (value) => value === null || isBool(value),
	checkInMinutes: inRange(0, CHECK_IN_MAX),
	myDayStart: isClock,
	myDayEnd: inRange(1, 1440)
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
	const { myDayStart, myDayEnd } = body as SettingsPatch;
	if (myDayStart !== undefined && myDayEnd !== undefined && myDayEnd - myDayStart < MY_DAY_MIN)
		return { ok: false, error: 'My day has to be at least an hour long' };
	return { ok: true, value: body as SettingsPatch };
}

export const agentPatch = (value: AgentSettings): SettingsPatch => ({
	aiAutonomy: value.autonomy,
	aiEvents: value.events.join(' '),
	quietStart: value.quietStart,
	quietEnd: value.quietEnd,
	dailyTokenBudget: value.dailyTokenBudget
});

/** The choices the settings page offers as one tap, in minutes. Any stored value stays valid, see `withCurrent`. */
export const HEADS_UP_PRESETS = [5, 10, 15, 30];
export const OVERRUN_PRESETS = [10, 15, 30, 60];
/** 0 is off. */
export const CHECK_IN_PRESETS = [0, 5, 10, 15];
/** Tokens a day for unprompted reactions. No limit is `null` and has its own chip. */
export const BUDGET_PRESETS = [50_000, 200_000];

/** The presets, plus the stored value when it is none of them (set earlier or on another device), in order. */
export function withCurrent(presets: number[], current: number): number[] {
	return presets.includes(current) ? presets : [...presets, current].sort((a, b) => a - b);
}

/** `5 min`, `1 h`, or `Off` for zero. */
export function minutesChip(minutes: number): string {
	if (minutes === 0) return 'Off';
	return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

/** `No limit`, `50k` or `1.5M` for a daily token budget. */
export function budgetChip(tokens: number | null): string {
	if (tokens === null) return 'No limit';
	if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
	return `${tokens / 1000}k`;
}
