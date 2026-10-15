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

/** The one ramp: every surface that shows a priority takes its color from the urgency of that priority. */
const RAMP: Record<UrgencyLevel, Pick<PriorityStyle, 'chip' | 'block'>> = {
	// Literal class names, so Tailwind can find them
	0: {
		chip: 'bg-urgency-0/20 border border-urgency-0 text-foreground',
		block: 'bg-urgency-0 border-urgency-0 text-urgency-0-foreground'
	},
	1: {
		chip: 'bg-urgency-1/20 border border-urgency-1 text-foreground',
		block: 'bg-urgency-1 border-urgency-1 text-urgency-1-foreground'
	},
	2: {
		chip: 'bg-urgency-2/20 border border-urgency-2 text-foreground',
		block: 'bg-urgency-2 border-urgency-2 text-urgency-2-foreground'
	},
	3: {
		chip: 'bg-urgency-3/20 border border-urgency-3 text-foreground',
		block: 'bg-urgency-3 border-urgency-3 text-urgency-3-foreground'
	}
};
const ramp = (level: UrgencyLevel) => RAMP[level];

export const priorityStyle: Record<Priority, PriorityStyle> = {
	[Priority.Low]: { label: 'Low', ...ramp(baseLevel[Priority.Low]), bars: 1 },
	[Priority.Medium]: { label: 'Medium', ...ramp(baseLevel[Priority.Medium]), bars: 2 },
	[Priority.High]: { label: 'High', ...ramp(baseLevel[Priority.High]), bars: 3 },
	[Priority.Urgent]: { label: 'Urgent', ...ramp(baseLevel[Priority.Urgent]), bars: 4 },
	[Priority.Critical]: { label: 'Critical', ...ramp(baseLevel[Priority.Critical]), bars: 5 }
};
