import { type Task } from '#lib/types.js';
import type { Repeat } from '#lib/schedule.js';
import type { Tone } from '#lib/tones.js';
import type { SoundSlot } from '#lib/sounds.js';
import type { Backend } from '#lib/backend.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import type { AllDayLine } from '#lib/core/calendar.js';
import type { Comparison } from '#lib/core/merge.js';
import type { FlowRow, Todo } from '#lib/core/repo.js';
import { clientSettings, type ClientSettings } from '#lib/settings.js';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Toast {
	id: number;
	message: string;
	/** Reverts the action the toast reports, the toast offers an Undo button when set. */
	undo?: () => unknown;
}

export interface ChatEntry {
	role: 'user' | 'assistant';
	content: string;
	/** Plan changes made while answering, each can be undone. */
	changes?: { id: number; summary: string; dates: string[]; undone?: boolean }[];
	error?: boolean;
}

/** A note or question the agent put on the Now screen. */
export interface AgentCard {
	id: number;
	kind: 'say' | 'ask';
	text: string;
	options: string[];
}

/** An alarm as the client keeps it, so it still rings when the stream is down for a moment. */
export interface Alarm {
	id: number;
	fireAt: number;
	label: string;
	tone: Tone;
	repeat: Repeat;
	/** Minutes it rings before it stops by itself. */
	durationMin: number;
	/** Off: it stays in the list and never rings. */
	enabled: boolean;
	createdBy: 'user' | 'agent';
}

export interface Wakeup {
	id: number;
	fireAt: number;
	note: string;
}

export const tasker: {
	/** Where everything is stored and computed, set once when the app loads. */
	backend: Backend;
	/** `email` is null for a guest, whose plan lives on this device. `ready` turns true once the plan could be read (a guest waits for the device), `problem` says why it could not. */
	account: { email: string | null; ready: boolean; problem: string | null };
	/** The user's settings as the screens use them, kept in step with the backend after every save. */
	settings: ClientSettings;
	tasks: Task[];
	/** Open to-dos and the ones finished in the last day and a half. */
	todos: Todo[];
	/** What the user answered on `date` (their today), oldest first. The flow engine replays it, nothing else is stored. */
	flow: { date: string | null; rows: FlowRow[] };
	isMuted: boolean;
	/** Epoch ms when a timed mute ends and sound returns on its own, null while muted without an end. */
	mutedUntil: number | null;
	volume: number; // 0-100
	themeMode: ThemeMode;
	timezone: string | null; // IANA name from the user's settings, null until set
	toasts: Toast[]; // oldest first, the newest sits at the bottom
	assistant: { open: boolean; busy: boolean; messages: ChatEntry[] }; // the chat lives for this page session only
	agent: { cards: AgentCard[]; cursor: number | null }; // cursor: last agent action id seen, null before the first poll
	schedule: {
		alarms: Alarm[];
		wakeups: Wakeup[];
		ringing: { id: number; label: string; canSnooze: boolean } | null;
		loaded: boolean;
	};
	device: { id: string; display: string | null; streaming: boolean; audioBlocked: boolean }; // display: the device that plays sound, null means every device. audioBlocked: the browser has not unlocked audio yet
	voice: { replies: boolean; recording: boolean; transcribing: boolean; speaking: boolean }; // replies: the user's setting to hear the assistant
	/** The sounds this device replaced with a file of the user's own: slot to file name. The audio itself is in `custom-sounds.ts`. */
	sounds: Partial<Record<SoundSlot, string>>;
	/** What this device was already told. Both start as told (nothing shows) until the flags are read, so a first paint never flashes the welcome. */
	firstRun: { welcomed: boolean };
	/** Ids of the sample day's tasks still in the plan (a guest's device only). */
	sample: number[];
	/**
	 * A signed in visitor whose device still holds a plan from before: the choice on the move screen. The screen
	 * shows while `comparison` is set, nothing is written until the visitor chose. The plan itself is not kept here:
	 * a state proxy cannot be stored in IndexedDB, `move.ts` holds it.
	 */
	move: {
		comparison: Comparison | null;
		/** The device has its own OpenAI key, which can go to the account. */
		hasKey: boolean;
		busy: boolean;
		error: string | null;
	};
	/** All-day events of the day Plan shows, one line each (Calendar is read for an account only). */
	calendar: { allDay: AllDayLine[] };
	/** The day Plan shows, null until Plan opens. The bar holds the day switcher, so the state is shared. */
	plan: { date: string | null };
	/** The appointment the prep sheet is open for, `null` while it is closed. Any screen that makes one opens it. */
	prep: { appointment: Task | null };
} = $state({
	backend: remoteBackend,
	account: { email: null, ready: false, problem: null },
	settings: clientSettings(DEFAULT_SETTINGS),
	tasks: [],
	todos: [],
	flow: { date: null, rows: [] },
	isMuted: false,
	mutedUntil: null,
	volume: 100,
	themeMode: 'auto',
	timezone: null,
	toasts: [],
	assistant: { open: false, busy: false, messages: [] },
	agent: { cards: [], cursor: null },
	schedule: { alarms: [], wakeups: [], ringing: null, loaded: false },
	device: { id: '', display: null, streaming: false, audioBlocked: false },
	voice: { replies: false, recording: false, transcribing: false, speaking: false },
	sounds: {},
	firstRun: { welcomed: true },
	sample: [],
	move: { comparison: null, hasKey: false, busy: false, error: null },
	calendar: { allDay: [] },
	plan: { date: null },
	prep: { appointment: null }
});
