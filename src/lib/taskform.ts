import { formatClock } from '#lib/format.js';
import { addDays } from '#lib/time.js';

/** Quick durations next to the start time, in minutes. Anything else goes in the free field. */
export const DURATION_CHIPS = [15, 30, 45, 60, 120];

export const DAY_END = 1440;

export type DateChoice = 'today' | 'tomorrow' | 'other';

/** Which date chip is lit: the picker covers every other day. */
export function dateChoice(date: string, today: string): DateChoice {
	if (date === today) return 'today';
	if (date === addDays(today, 1)) return 'tomorrow';
	return 'other';
}

/** The line under the start time, so nobody does the math. A task cannot run past midnight. */
export function endLine(startTime: number, duration: number): { text: string; over: boolean } {
	const end = startTime + duration;
	if (end > DAY_END) return { text: 'Too long: a task has to end by midnight', over: true };
	return { text: `Ends ${formatClock(end)}`, over: false };
}

/** `HH:MM` from a time field as minutes since midnight, null when it is empty or not a time. */
export function parseClock(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/** True when the duration is one of the chips, false when it needs the free field. */
export function isChipDuration(duration: number): boolean {
	return DURATION_CHIPS.includes(duration);
}
