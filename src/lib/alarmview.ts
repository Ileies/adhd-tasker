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

/** How an alarm relates to one day of the plan: rings that day, rings on other days only, or is switched off. */
export type AlarmDayState = 'on-day' | 'other-day' | 'off';

/**
 * `fireAt` is the next ring, so a repeating alarm rings on every matching day from that one on. A weekday alarm
 * skips Saturday and Sunday.
 */
export function alarmDayState(alarm: Alarm, date: string, timezone: string): AlarmDayState {
	if (!alarm.enabled) return 'off';
	const first = localMoment(alarm.fireAt, timezone).date;
	if (alarm.repeat === 'none') return first === date ? 'on-day' : 'other-day';
	if (date < first) return 'other-day';
	const day = new Date(date + 'T00:00:00Z').getUTCDay();
	return alarm.repeat === 'weekdays' && (day === 0 || day === 6) ? 'other-day' : 'on-day';
}

const STATE_ORDER: Record<AlarmDayState, number> = { 'on-day': 0, 'other-day': 1, off: 2 };

/** The alarms for the panel next to one day: those that ring that day first, then the others, the switched off last, each by clock time. */
export function dayPanelAlarms(
	alarms: Alarm[],
	date: string,
	timezone: string
): { alarm: Alarm; state: AlarmDayState; minutes: number }[] {
	return alarms
		.map((alarm) => ({
			alarm,
			state: alarmDayState(alarm, date, timezone),
			minutes: localMoment(alarm.fireAt, timezone).minutes
		}))
		.sort(
			(a, b) =>
				STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
				a.minutes - b.minutes ||
				a.alarm.id - b.alarm.id
		);
}

/**
 * Where cards that each want the vertical middle `wanted[i]` (px, ascending) are put so they do not overlap:
 * a card that would cover the one above is pushed down. Returns the top of every card.
 */
export function stackCards(wanted: number[], height: number, gap = 4): number[] {
	let free = 0;
	return wanted.map((middle) => {
		const top = Math.max(free, middle - height / 2);
		free = top + height + gap;
		return top;
	});
}

/** The words that say the state of an alarm for one day, so color is never the only cue. `dayLabel` names the next ring. */
export function alarmStatus(alarm: Alarm, state: AlarmDayState, dayLabel: string): string {
	if (state === 'off') return 'Off';
	if (state === 'on-day')
		return alarm.repeat === 'none' ? 'Rings this day' : 'Rings this day, repeats';
	return alarm.repeat === 'weekdays' ? 'Not on weekends' : `Next ${dayLabel}`;
}

/** One alarm and how it relates to the day shown. */
export type DayAlarm = ReturnType<typeof dayPanelAlarms>[number];
