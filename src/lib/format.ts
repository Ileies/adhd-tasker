/** Minutes since midnight as `HH:MM`, same unit as `task.startTime`. */
export function formatClock(minutes: number): string {
	return Math.floor(minutes / 60).toString().padStart(2, '0') + ':' + (minutes % 60).toString().padStart(2, '0');
}

/** A span of minutes as `1h 30m`, `2h` or `45m`. */
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) return `${mins}m`;
	return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** Remaining minutes as `H:MM` for countdowns. */
export function formatCountdown(minutes: number): string {
	return Math.floor(minutes / 60) + ':' + (minutes % 60).toString().padStart(2, '0');
}
