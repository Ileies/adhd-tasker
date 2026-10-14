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
