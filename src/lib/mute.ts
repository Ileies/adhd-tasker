/** Timed mute: sound comes back on its own. Pure, `theme.ts` stores it and sets the timer. */

export interface MuteOption {
	/** Minutes, `null` stays muted until the user unmutes. */
	minutes: number | null;
	text: string;
}

export const MUTE_OPTIONS: MuteOption[] = [
	{ minutes: 60, text: 'Mute for 1 hour' },
	{ minutes: 30, text: 'Mute for 30 min' },
	{ minutes: null, text: 'Mute until I unmute' }
];

/** Epoch ms when the mute ends, `null` for no end. */
export const muteEnd = (now: number, minutes: number | null): number | null =>
	minutes === null ? null : now + minutes * 60_000;

/** What was saved on this device: muted, and when it ends. A mute that ended while the app was closed is over. */
export function restoreMute(
	muted: boolean,
	until: number | null,
	now: number
): { muted: boolean; until: number | null } {
	if (!muted) return { muted: false, until: null };
	if (until !== null && until <= now) return { muted: false, until: null };
	return { muted: true, until };
}
