import { EVENT_TYPES, isEventType, type EventType } from '#lib/events.js';

/** observe: only log. suggest: say or ask, never edit. act: may edit the plan, every edit can be undone. */
export const AUTONOMY = ['observe', 'suggest', 'act'] as const;
export type Autonomy = (typeof AUTONOMY)[number];
export const isAutonomy = (value: unknown): value is Autonomy => AUTONOMY.includes(value as Autonomy);

/**
 * Types that are never a toggle: `user.message` is the chat itself, an alarm only rings, a wakeup is the
 * agent's own appointment (it is still bound by autonomy, quiet hours, rate limit and budget), and "I'm stuck" is
 * a request for help the user just made.
 */
const NOT_TOGGLES: EventType[] = ['user.message', 'alarm.fired', 'wakeup.fired', 'stuck.pressed'];
/** Event types the user can switch on or off. */
export const REACTION_EVENTS = EVENT_TYPES.filter((type) => !NOT_TOGGLES.includes(type));
/** Plan edits and every switch are too frequent to react to by default, the user can opt in. */
export const DEFAULT_REACTION_EVENTS: EventType[] = ['task.completed', 'task.missed', 'task.overrun'];

export const LIMITS = {
	/** Events within this window become one reaction. */
	coalesceMs: 5000,
	perHour: 6,
	minGapMs: 3 * 60_000,
	/** Unhandled events older than this are dropped after a restart instead of answered late. */
	staleMs: 10 * 60_000,
	maxToolCalls: 4
} as const;

export const DEFAULT_QUIET = { start: 22 * 60, end: 7 * 60 } as const;

export interface AgentSettings {
	autonomy: Autonomy;
	events: EventType[];
	quietStart: number;
	quietEnd: number;
	/** Tokens per day for unprompted reactions, null means no limit. */
	dailyTokenBudget: number | null;
}

export const parseEvents = (stored: string): EventType[] => stored.split(' ').filter(isEventType);

/** True when `now` (minutes since midnight) lies in the quiet window, which may wrap over midnight. Equal bounds mean no quiet hours. */
export function inQuietHours(now: number, start: number, end: number): boolean {
	if (start === end) return false;
	return start < end ? now >= start && now < end : now >= start || now < end;
}

export interface ReactionContext {
	settings: AgentSettings;
	hasKey: boolean;
	/** Minutes since midnight in the user's timezone. */
	now: number;
	nowMs: number;
	/** `createdAt` (ms) of the reactions already made in the last hour, newest or oldest first. */
	recentReactions: number[];
	tokensToday: number;
}

export type Decision = { run: true } | { run: false; reason: string };

/** Everything that can keep the agent quiet, in one place so it is testable. Doing nothing is always allowed. */
export function decideReaction(context: ReactionContext, types: EventType[]): Decision {
	const { settings } = context;
	if (settings.autonomy === 'observe') return { run: false, reason: 'autonomy is observe' };
	if (!context.hasKey) return { run: false, reason: 'no OpenAI key' };
	// Someone who pressed "I'm stuck" is here and asking, so quiet hours, the budget and the gap between reactions do not apply
	const asked = types.includes('stuck.pressed');
	if (!asked && !types.some((type) => type === 'wakeup.fired' || settings.events.includes(type))) return { run: false, reason: 'event type is switched off' };
	if (!asked && inQuietHours(context.now, settings.quietStart, settings.quietEnd)) return { run: false, reason: 'quiet hours' };
	if (!asked && settings.dailyTokenBudget !== null && context.tokensToday >= settings.dailyTokenBudget) return { run: false, reason: 'daily token budget used up' };
	if (context.recentReactions.length >= LIMITS.perHour) return { run: false, reason: 'hourly limit reached' };
	const latest = Math.max(0, ...context.recentReactions);
	if (!asked && context.nowMs - latest < LIMITS.minGapMs) return { run: false, reason: 'too soon after the last reaction' };
	return { run: true };
}

const parseClock = (value: unknown): number | undefined => {
	const match = typeof value === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
	return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

/** Settings form: autonomy, quiet hours (HH:MM), ticked events and the optional daily budget (thousands of tokens). */
export function parseSettingsForm(form: FormData): { ok: true; value: AgentSettings } | { ok: false; error: string } {
	const autonomy = form.get('autonomy');
	if (!isAutonomy(autonomy)) return { ok: false, error: 'Choose how much the assistant may do' };

	const quietStart = parseClock(form.get('quietStart'));
	const quietEnd = parseClock(form.get('quietEnd'));
	if (quietStart === undefined || quietEnd === undefined) return { ok: false, error: 'Quiet hours need a start and an end time' };

	const events = form.getAll('event').filter((value): value is EventType => isEventType(value) && !NOT_TOGGLES.includes(value));

	const rawBudget = String(form.get('budget') ?? '').trim();
	let dailyTokenBudget: number | null = null;
	if (rawBudget) {
		const thousands = Number(rawBudget);
		if (!Number.isInteger(thousands) || thousands < 1 || thousands > 100_000) return { ok: false, error: 'The budget is a whole number of thousand tokens, or empty for no limit' };
		dailyTokenBudget = thousands * 1000;
	}

	return { ok: true, value: { autonomy, events, quietStart, quietEnd, dailyTokenBudget } };
}
