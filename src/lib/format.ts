/** Minutes since midnight as `HH:MM`, same unit as `task.startTime`. */
export function formatClock(minutes: number): string {
	return (
		Math.floor(minutes / 60)
			.toString()
			.padStart(2, '0') +
		':' +
		(minutes % 60).toString().padStart(2, '0')
	);
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

/** Remaining minutes as `H:MM` for countdowns. */
export function formatCountdown(minutes: number): string {
	return Math.floor(minutes / 60) + ':' + (minutes % 60).toString().padStart(2, '0');
}
