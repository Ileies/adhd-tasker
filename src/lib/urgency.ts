import { Priority } from '#lib/types.js';

/** 0 calm, 1 normal, 2 pressing, 3 critical. Matches the `--urgency-*` tokens in app.css. */
export type UrgencyLevel = 0 | 1 | 2 | 3;

const baseLevel: Record<Priority, UrgencyLevel> = {
	[Priority.Low]: 0,
	[Priority.Medium]: 1,
	[Priority.High]: 2,
	[Priority.Urgent]: 2,
	[Priority.Critical]: 3
};

/**
 * Urgency from priority and time pressure. A task never gets calmer than its priority,
 * running low on time raises it to at least pressing, and overrunning makes it critical.
 */
export function urgencyLevel(priority: Priority, timeLeft: number, duration: number): UrgencyLevel {
	const base = baseLevel[priority] ?? baseLevel[Priority.Medium];
	if (timeLeft < 0) return 3;
	if (duration > 0 && timeLeft / duration < 0.25) return Math.max(base, 2) as UrgencyLevel;
	return base;
}

/** Full-bleed surface for the Now view. */
export const urgencySurface: Record<UrgencyLevel, string> = {
	0: 'bg-urgency-0 text-urgency-0-foreground',
	1: 'bg-urgency-1 text-urgency-1-foreground',
	2: 'bg-urgency-2 text-urgency-2-foreground',
	3: 'bg-urgency-3 text-urgency-3-foreground'
};

interface PriorityStyle {
	label: string;
	/** Soft tinted chip for lists. */
	chip: string;
	/** Solid block for the timeline. */
	block: string;
	/** Segments filled out of 5, a cue that does not rely on color. */
	bars: number;
}

export const priorityStyle: Record<Priority, PriorityStyle> = {
	[Priority.Low]: {
		label: 'Low',
		chip: 'bg-muted text-muted-foreground',
		block: 'bg-muted border-border text-muted-foreground',
		bars: 1
	},
	[Priority.Medium]: {
		label: 'Medium',
		chip: 'bg-info/20 text-info',
		block: 'bg-secondary border-primary/50 text-secondary-foreground',
		bars: 2
	},
	[Priority.High]: {
		label: 'High',
		chip: 'bg-warning/25 text-warning',
		block: 'bg-info/80 border-info text-info-foreground',
		bars: 3
	},
	[Priority.Urgent]: {
		label: 'Urgent',
		chip: 'bg-destructive/15 text-destructive',
		block: 'bg-warning/80 border-warning text-warning-foreground',
		bars: 4
	},
	[Priority.Critical]: {
		label: 'Critical',
		chip: 'bg-destructive text-white',
		block: 'bg-destructive/80 border-destructive text-white',
		bars: 5
	}
};
