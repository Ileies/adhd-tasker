/**
 * What the Alarms page and the ringing banner decide: the quick timers, the Today and Later groups, how to
 * put a cancelled alarm back, and the one snooze.
 */
import type { Alarm } from '#lib/app.svelte.js';
import type { AlarmFields } from '#lib/backend.js';
import { localMoment } from '#lib/time.js';
import { TONE_TEXT, isToneName, type ToneName } from '#lib/tones.js';

/** One tap sets a timer. */
export const QUICK_TIMERS = [
	{ minutes: 5, label: '5 min' },
	{ minutes: 10, label: '10 min' },
	{ minutes: 25, label: '25 min' },
	{ minutes: 60, label: '1 h' }
] as const;

export const TIMER_LABEL = 'Timer';
/** Snooze rings the same alarm again once, so it can not become a loop. */
export const SNOOZE_MINUTES = 5;

export const timerFields = (minutes: number): AlarmFields => ({
	in_minutes: minutes,
	label: TIMER_LABEL,
	tone: 'chime',
	repeat: 'none'
});

/** The alarms of the user's today, then the rest, each in time order. */
export function groupAlarms(
	alarms: Alarm[],
	nowMs: number,
	timezone: string
): { today: Alarm[]; later: Alarm[] } {
	const sorted = [...alarms].sort((a, b) => a.fireAt - b.fireAt);
	const today = localMoment(nowMs, timezone).date;
	return {
		today: sorted.filter((alarm) => localMoment(alarm.fireAt, timezone).date === today),
		later: sorted.filter((alarm) => localMoment(alarm.fireAt, timezone).date !== today)
	};
}

const clockText = (minutes: number) =>
	`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Fields that bring a cancelled alarm back: a repeating one at its clock time, a one-off as minutes from now. */
export function restoreFields(alarm: Alarm, nowMs: number, timezone: string): AlarmFields {
	const tone = isToneName(alarm.tone) ? alarm.tone : 'chime';
	const common = { label: alarm.label, tone, duration_minutes: alarm.durationMin };
	if (alarm.repeat !== 'none')
		return {
			...common,
			at: clockText(localMoment(alarm.fireAt, timezone).minutes),
			repeat: alarm.repeat
		};
	return {
		...common,
		in_minutes: Math.max(1, Math.round((alarm.fireAt - nowMs) / 60_000)),
		repeat: 'none'
	};
}

/** `Wake` for "Wake: a rising and falling melody": the name alone fits a menu. */
export const toneLabel = (name: ToneName) => TONE_TEXT[name].split(':')[0];
