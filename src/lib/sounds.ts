/**
 * The anchor sounds a user can replace with a file of their own. Pure rules only: which sounds, what is accepted.
 * The files live on the device (`local/sounds.ts`), they are never uploaded to the server. The caps match the
 * synthesized tones: nothing longer than 5 s, and the user's volume stays the ceiling (the player multiplies by it).
 */
export const SOUND_SLOTS = ['task-started', 'reminder', 'wrap-up', 'done'] as const;
export type SoundSlot = (typeof SOUND_SLOTS)[number];

export const isSoundSlot = (value: unknown): value is SoundSlot =>
	SOUND_SLOTS.includes(value as SoundSlot);

export const SOUND_TEXT: Record<SoundSlot, { label: string; hint: string }> = {
	'task-started': { label: 'Task starts', hint: 'When the current task changes' },
	reminder: { label: 'Check-in and heads-up', hint: 'The soft chime while a task runs' },
	'wrap-up': { label: 'Wrapping up', hint: 'When a task enters its last minutes' },
	done: { label: 'Done', hint: 'When you finish a task' }
};

export const SOUND_LIMITS = {
	/** File size in bytes, keeps the device database small. */
	maxBytes: 1_000_000,
	/** Playing time in ms, the same cap as a tone. */
	maxMs: 5000
} as const;

/** What is kept per replaced sound. */
export interface StoredSound {
	slot: SoundSlot;
	/** The file name the user chose, shown in Settings. */
	name: string;
	data: ArrayBuffer;
}

/** Checks a picked file before it is read. Returns the reason in words, or null when it may be decoded. */
export function checkSoundFile(file: { type: string; size: number }): string | null {
	if (file.size === 0) return 'That file is empty.';
	if (file.type && !file.type.startsWith('audio/'))
		return 'Pick an audio file (mp3, wav, ogg, m4a).';
	if (file.size > SOUND_LIMITS.maxBytes)
		return `That file is too large. Keep it under ${SOUND_LIMITS.maxBytes / 1_000_000} MB.`;
	return null;
}

/** Checks a decoded sound's length. Returns the reason in words, or null when it may be kept. */
export function checkSoundLength(seconds: number): string | null {
	if (!Number.isFinite(seconds) || seconds <= 0) return 'That sound has no length.';
	if (seconds * 1000 > SOUND_LIMITS.maxMs)
		return `That sound is too long. Keep it under ${SOUND_LIMITS.maxMs / 1000} seconds.`;
	return null;
}

/** A file name for the settings line: no path, at most 40 characters. */
export function shortFileName(name: string): string {
	const base = name.split(/[\\/]/).pop()?.trim() || 'Your sound';
	return base.length > 40 ? `${base.slice(0, 37)}...` : base;
}
