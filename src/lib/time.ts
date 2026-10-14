/** The timezone of this device, as an IANA name. */
export function deviceTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/** Current time as minutes since midnight in the given timezone (device timezone if omitted), same unit as `task.startTime`. */
export function minutesNow(timezone?: string | null): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone && isValidTimezone(timezone) ? timezone : undefined,
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(new Date());
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return get('hour') * 60 + get('minute');
}

/** A calendar day as `YYYY-MM-DD`, the format of `task.date`. */
export type DateKey = string;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is DateKey {
	return (
		typeof value === 'string' &&
		DATE_KEY.test(value) &&
		!Number.isNaN(Date.parse(value + 'T00:00:00Z'))
	);
}

/** Today's date in the given timezone (device timezone if omitted). */
export function todayIn(timezone?: string | null, at = new Date()): DateKey {
	// The en-CA locale formats as YYYY-MM-DD
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone && isValidTimezone(timezone) ? timezone : undefined,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}

/** Moves a date by whole days, calendar arithmetic only so timezones and daylight saving do not matter. */
export function addDays(date: DateKey, days: number): DateKey {
	const moved = new Date(date + 'T00:00:00Z');
	moved.setUTCDate(moved.getUTCDate() + days);
	return moved.toISOString().slice(0, 10);
}

/** The epoch ms of a wall clock moment (`date` plus minutes since midnight) in a timezone, daylight saving included. */
export function zonedToEpoch(date: DateKey, minutes: number, timezone: string): number {
	const wall = Date.parse(date + 'T00:00:00Z') + minutes * 60_000;
	const offsetAt = (at: number) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: isValidTimezone(timezone) ? timezone : 'UTC',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			hourCycle: 'h23'
		}).formatToParts(new Date(at));
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
		return (
			Date.UTC(
				get('year'),
				get('month') - 1,
				get('day'),
				get('hour'),
				get('minute'),
				get('second')
			) - at
		);
	};
	// Two passes settle the offset when the guess lands on the other side of a daylight saving change
	const first = wall - offsetAt(wall);
	return wall - offsetAt(first);
}

/** `Today`, `Tomorrow`, `Yesterday` or a short weekday and date such as `Fri, Oct 16`. */
export function formatDay(date: DateKey, today: DateKey): string {
	if (date === today) return 'Today';
	if (date === addDays(today, 1)) return 'Tomorrow';
	if (date === addDays(today, -1)) return 'Yesterday';
	return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}
