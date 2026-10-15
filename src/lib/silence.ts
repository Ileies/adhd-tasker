export interface SoundState {
	muted: boolean;
	/** 0 to 100 */
	volume: number;
	/** The browser has not allowed audio yet, it needs a tap or a key press. */
	blocked: boolean;
	/** This device is the one that plays sound. A device that stays quiet on purpose says nothing. */
	plays: boolean;
	/** When a timed mute ends, as the clock shows it (`15:30`). */
	mutedUntil?: string | null;
}

/**
 * The line that tells the user why nothing will be heard, or `null` when sound works.
 * Silence the user did not choose (blocked audio) says how to fix it.
 */
export function silenceLine(sound: SoundState): string | null {
	if (!sound.plays) return null;
	if (sound.muted && sound.mutedUntil) return `Sound off until ${sound.mutedUntil}`;
	if (sound.muted || sound.volume <= 0) return 'Sound off';
	if (sound.blocked) return 'Tap anywhere to turn sound on';
	return null;
}
