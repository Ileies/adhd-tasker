/** Minutes since midnight as `HH:MM`, same unit as `task.startTime`. Always 24 hour: for inputs, prompts and stored values. */
export function formatClock24(minutes: number): string {
	return (
		Math.floor(minutes / 60)
			.toString()
			.padStart(2, '0') +
		':' +
		(minutes % 60).toString().padStart(2, '0')
	);
}

/** Minutes since midnight as `3:05 PM`. 0 and 1440 are 12:00 AM. */
export function formatClock12(minutes: number): string {
	const hours = Math.floor(minutes / 60) % 24;
	const hour = hours % 12 === 0 ? 12 : hours % 12;
	return `${hour}:${(minutes % 60).toString().padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

// The user's choice for every time the screens show. Set by the layout, which renders again when it changes
let hour12 = false;

export function setClockHour12(value: boolean) {
	hour12 = value;
}

/** Minutes since midnight for the screen, in the user's 12 or 24 hour format. */
export function formatClock(minutes: number): string {
	return hour12 ? formatClock12(minutes) : formatClock24(minutes);
}

/** A span of minutes as `1h 30m`, `2h` or `45m`. */
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) return `${mins}m`;
	return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** Minutes in words, `28 min`, `2 h` or `1 h 20 min`. */
export function formatMinutes(minutes: number): string {
	const whole = Math.max(0, Math.floor(minutes));
	const hours = Math.floor(whole / 60);
	const mins = whole % 60;
	if (hours === 0) return `${mins} min`;
	return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

/** Time left in words for the hero, `28 min left, until 15:00`. Without `until` (an end time in minutes) it is just the first part. */
export function formatLeft(minutes: number, until?: number): string {
	const left = minutes < 1 ? 'Less than 1 min left' : `${formatMinutes(minutes)} left`;
	return until === undefined ? left : `${left}, until ${formatClock(until)}`;
}

/** The device's own preference: 12 hour when its locale uses AM and PM. 24 hour where that cannot be told (the server, odd values). */
export function deviceClock12h(): boolean {
	if (typeof document === 'undefined') return false;
	const cycle = new Intl.DateTimeFormat().resolvedOptions().hourCycle;
	return cycle === 'h12' || cycle === 'h11';
}

/** What the screens use: the saved choice, or the device's preference while none was saved. */
export function effectiveClock12h(saved: boolean | null | undefined): boolean {
	return saved ?? deviceClock12h();
}
