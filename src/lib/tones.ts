/**
 * The tone library. Tones are note sequences synthesized with Web Audio, there are no audio files.
 * A tone is stored with its alarm as JSON, so it replays identically. The safety caps live here, in one
 * pure place: nothing longer than 5 s, never louder than the user's volume (the player multiplies by it),
 * and no visual effect at all, so there is nothing that could flash.
 */
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type Wave = (typeof WAVES)[number];

export interface Note {
	/** Pitch in Hz. */
	hz: number;
	/** Length in ms. */
	ms: number;
	/** Silence after the note in ms. */
	rest?: number;
}

export interface CustomTone {
	wave: Wave;
	notes: Note[];
}

export const TONE_LIMITS = {
	maxMs: 5000,
	maxNotes: 12,
	minNoteMs: 50,
	maxNoteMs: 1500,
	maxRestMs: 500,
	minHz: 100,
	maxHz: 2000,
	/** Agent-defined tones per day, named tones are unlimited. */
	customPerDay: 3
} as const;

/** Names the agent and the user can pick. */
export const TONE_NAMES = ['wake', 'chime', 'soft', 'nudge', 'rising', 'urgent'] as const;
export type ToneName = (typeof TONE_NAMES)[number];
export const isToneName = (value: unknown): value is ToneName =>
	TONE_NAMES.includes(value as ToneName);

/** What is stored: a library name or a custom sequence. */
export type Tone = ToneName | CustomTone;

export const TONE_TEXT: Record<ToneName, string> = {
	wake: 'Wake: a rising and falling melody, made for ringing',
	chime: 'Chime: two bright notes',
	soft: 'Soft: one gentle note',
	nudge: 'Nudge: two short taps',
	rising: 'Rising: four notes going up',
	urgent: 'Urgent: three sharp beeps'
};

const LIBRARY: Record<ToneName, CustomTone> = {
	// A major arpeggio up and a step back down, about 3 s. Loops well because it ends where it can start again.
	wake: {
		wave: 'triangle',
		notes: [
			{ hz: 523, ms: 160, rest: 40 },
			{ hz: 659, ms: 160, rest: 40 },
			{ hz: 784, ms: 160, rest: 40 },
			{ hz: 1047, ms: 320, rest: 120 },
			{ hz: 988, ms: 160, rest: 40 },
			{ hz: 784, ms: 160, rest: 40 },
			{ hz: 659, ms: 160, rest: 40 },
			{ hz: 784, ms: 480 }
		]
	},
	chime: {
		wave: 'sine',
		notes: [
			{ hz: 880, ms: 180, rest: 40 },
			{ hz: 1320, ms: 420 }
		]
	},
	soft: { wave: 'sine', notes: [{ hz: 523, ms: 900 }] },
	nudge: {
		wave: 'triangle',
		notes: [
			{ hz: 660, ms: 110, rest: 110 },
			{ hz: 660, ms: 110 }
		]
	},
	rising: {
		wave: 'sine',
		notes: [
			{ hz: 440, ms: 200 },
			{ hz: 554, ms: 200 },
			{ hz: 659, ms: 200 },
			{ hz: 880, ms: 500 }
		]
	},
	urgent: {
		wave: 'square',
		notes: [
			{ hz: 988, ms: 160, rest: 120 },
			{ hz: 988, ms: 160, rest: 120 },
			{ hz: 988, ms: 160 }
		]
	}
};

export const DEFAULT_TONE: ToneName = 'chime';

/** Total playing time of a sequence in ms, notes and rests. */
export function toneLength(tone: CustomTone): number {
	return tone.notes.reduce((sum, note) => sum + note.ms + (note.rest ?? 0), 0);
}

export const RING = {
	/** Share of the user's volume at the first repeat, so the alarm does not start with a jolt. */
	startGain: 0.15,
	/** Time until the full volume is reached. */
	rampMs: 20_000,
	/** Silence between two repeats of the tone, short so it reads as one continuous ring. */
	gapMs: 350
} as const;

/** Share of the user's volume (0 to 1) `elapsedMs` after a ring started: quick, linear and never past the ceiling. */
export function ringGain(elapsedMs: number): number {
	const progress = Math.min(1, Math.max(0, elapsedMs / RING.rampMs));
	return RING.startGain + (1 - RING.startGain) * progress;
}

/**
 * When each repeat of a ringing alarm starts and how loud it is. The tone loops back to back until `durationMs`
 * is over, a repeat that would start after that is not played.
 */
export function ringTimeline(
	tone: CustomTone,
	durationMs: number
): { atMs: number; gain: number }[] {
	return repeatTimeline(toneLength(tone), durationMs);
}

/** The same for any sound that plays for `phraseMs`, such as an uploaded file. */
export function repeatTimeline(
	phraseMs: number,
	durationMs: number
): { atMs: number; gain: number }[] {
	const step = phraseMs + RING.gapMs;
	const repeats: { atMs: number; gain: number }[] = [];
	for (let atMs = 0; atMs < durationMs; atMs += step) repeats.push({ atMs, gain: ringGain(atMs) });
	return repeats;
}

/** The notes to play for any stored tone. */
export function toneNotes(tone: Tone): CustomTone {
	return typeof tone === 'string' ? LIBRARY[tone] : tone;
}

/** Validates a custom sequence, the caps apply to anything the model defines. */
export function parseCustomTone(
	value: unknown
): { ok: true; value: CustomTone } | { ok: false; error: string } {
	const fail = (error: string) => ({ ok: false as const, error });
	if (typeof value !== 'object' || value === null)
		return fail('a custom tone is an object with wave and notes');
	const { wave, notes } = value as { wave?: unknown; notes?: unknown };
	if (!WAVES.includes(wave as Wave)) return fail(`wave must be one of ${WAVES.join(', ')}`);
	if (!Array.isArray(notes) || notes.length === 0 || notes.length > TONE_LIMITS.maxNotes)
		return fail(`notes is a list of 1 to ${TONE_LIMITS.maxNotes} notes`);

	const parsed: Note[] = [];
	for (const note of notes) {
		const { hz, ms, rest } = (note ?? {}) as Record<string, unknown>;
		if (
			typeof hz !== 'number' ||
			!Number.isFinite(hz) ||
			hz < TONE_LIMITS.minHz ||
			hz > TONE_LIMITS.maxHz
		)
			return fail(`hz must be ${TONE_LIMITS.minHz} to ${TONE_LIMITS.maxHz}`);
		if (
			typeof ms !== 'number' ||
			!Number.isFinite(ms) ||
			ms < TONE_LIMITS.minNoteMs ||
			ms > TONE_LIMITS.maxNoteMs
		)
			return fail(`ms must be ${TONE_LIMITS.minNoteMs} to ${TONE_LIMITS.maxNoteMs}`);
		if (
			rest !== undefined &&
			(typeof rest !== 'number' ||
				!Number.isFinite(rest) ||
				rest < 0 ||
				rest > TONE_LIMITS.maxRestMs)
		)
			return fail(`rest must be 0 to ${TONE_LIMITS.maxRestMs}`);
		parsed.push({
			hz: Math.round(hz),
			ms: Math.round(ms),
			...(rest ? { rest: Math.round(rest) } : {})
		});
	}

	const tone: CustomTone = { wave: wave as Wave, notes: parsed };
	if (toneLength(tone) > TONE_LIMITS.maxMs)
		return fail(`a tone may last at most ${TONE_LIMITS.maxMs / 1000} seconds in total`);
	return { ok: true, value: tone };
}

/**
 * Reads a stored or requested tone: a library name, or a custom sequence. Returns the tone and whether it is custom
 * (custom ones are counted against the daily cap by the caller).
 */
export function parseTone(
	value: unknown
): { ok: true; value: Tone; custom: boolean } | { ok: false; error: string } {
	if (value === undefined || value === null)
		return { ok: true, value: DEFAULT_TONE, custom: false };
	if (isToneName(value)) return { ok: true, value, custom: false };
	if (typeof value === 'string')
		return {
			ok: false,
			error: `unknown tone, use one of ${TONE_NAMES.join(', ')} or define a custom one`
		};
	const custom = parseCustomTone(value);
	return custom.ok ? { ok: true, value: custom.value, custom: true } : custom;
}

/** For a stored JSON column: anything that no longer validates falls back to the default instead of breaking an alarm. */
export function readTone(value: unknown): Tone {
	const parsed = parseTone(value);
	return parsed.ok ? parsed.value : DEFAULT_TONE;
}
