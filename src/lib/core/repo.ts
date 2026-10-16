/**
 * The storage port: everything the assistant, the agent and the schedule need to read and write,
 * bound to one user. The server implements it with Drizzle (`#lib/server/db-repo.js`), a guest's
 * device with IndexedDB. Both run the same contract suite (`#test/repo-contract.js`), so an account
 * and a guest behave alike. Missing ids answer `null`, nothing here throws for "not found".
 */
import type { EventOrigin, EventType } from '#lib/events.js';
import type { Autonomy } from '#lib/guardrails.js';
import type { Repeat, ScheduleKind } from '#lib/schedule.js';
import type { Tone } from '#lib/tones.js';
import type { Priority, TaskStatus } from '#lib/types.js';

export interface Task {
	id: number;
	title: string;
	description: string;
	date: string; // YYYY-MM-DD in the user's timezone
	startTime: number;
	duration: number;
	priority: Priority;
	status: TaskStatus;
}

/** What a new task needs, the repo assigns the id. `status` defaults to pending. */
export type NewTask = Omit<Task, 'id' | 'status'> & { status?: TaskStatus };
export type TaskPatch = Partial<Omit<Task, 'id'>>;

/** The user's choices. `openaiKey` is whatever the backend stores: encrypted on the server, plain on a device. */
export interface Settings {
	enableReminders: boolean;
	reminderAdvanceTime: number;
	hyperfocusAlarm: boolean;
	overrunMinutes: number;
	darkMode: boolean;
	openaiKey: string | null;
	timezone: string | null;
	googleServices: string;
	aiAutonomy: Autonomy;
	aiEvents: string;
	quietStart: number;
	quietEnd: number;
	dailyTokenBudget: number | null;
	lastCurrentTaskId: number | null;
	displayDevice: string | null;
	voiceReplies: boolean;
	openaiTranscribe: boolean;
	/** BCP 47 tag from `VOICE_LANGUAGES` the microphone listens for, `null` follows the browser. */
	voiceLanguage: string | null;
	showClock: boolean;
	clock12h: boolean | null;
	checkInMinutes: number;
	myDayStart: number;
	myDayEnd: number;
	/** Where the user is, for the theme. All four are set or all are `null` (see `#lib/location.js`). */
	locationLat: number | null;
	locationLon: number | null;
	locationName: string | null;
	locationSource: 'ip' | 'device' | 'city' | null;
}

/** One change the assistant made, `before` and `after` are tasks, null when absent. */
export interface AgentAction {
	id: number;
	tool: string;
	before: Task | null;
	after: Task | null;
	eventId: number | null;
	reason: string | null;
	createdAt: number;
	undoneAt: number | null;
}
export type NewAgentAction = Omit<AgentAction, 'id' | 'undoneAt' | 'createdAt'> & {
	createdAt?: number;
};

export interface EventRow {
	id: number;
	type: EventType;
	payload: Record<string, unknown>;
	origin: EventOrigin;
	key: string | null;
	createdAt: number;
	handledAt: number | null;
	outcome: string | null;
}
/** `key` makes a detected event idempotent: one row per fact. */
export interface NewEvent {
	type: EventType;
	payload: Record<string, unknown>;
	origin: EventOrigin;
	key?: string | null;
	createdAt: number;
	handledAt?: number | null;
	outcome?: string | null;
}

export interface Card {
	id: number;
	kind: 'say' | 'ask';
	text: string;
	options: string[] | null;
	eventId: number | null;
	createdAt: number;
	resolvedAt: number | null;
}
export type NewCard = Pick<Card, 'kind' | 'text'> & {
	options?: string[] | null;
	eventId?: number | null;
	createdAt: number;
};

export interface ScheduleEntry {
	id: number;
	kind: ScheduleKind;
	fireAt: number; // epoch ms
	minutes: number | null; // local clock time of a repeating alarm
	repeat: Repeat;
	label: string | null;
	note: string | null;
	tone: Tone | null;
	durationMin: number; // minutes an alarm rings
	enabled: boolean; // an alarm that is off stays listed and never rings
	createdBy: 'user' | 'agent';
	status: 'pending' | 'done' | 'cancelled';
	createdAt: number;
}
export type NewEntry = Pick<ScheduleEntry, 'kind' | 'fireAt' | 'createdBy' | 'createdAt'> &
	Partial<
		Pick<
			ScheduleEntry,
			'minutes' | 'repeat' | 'label' | 'note' | 'tone' | 'durationMin' | 'enabled'
		>
	>;

export interface Repo {
	readonly email: string;

	tasks: {
		/** Both days inclusive, oldest first (date, then start). No `to`: everything from `from` on. */
		between(from: string, to?: string): Promise<Task[]>;
		get(id: number): Promise<Task | null>;
		insert(task: NewTask): Promise<Task>;
		update(id: number, patch: TaskPatch): Promise<Task | null>;
		/** The task as it was, `null` when there was none. */
		delete(id: number): Promise<Task | null>;
		/** Puts a deleted task back under its old id, does nothing when the id is taken (undo). */
		restore(task: Task): Promise<void>;
	};

	actions: {
		record(action: NewAgentAction): Promise<number>;
		get(id: number): Promise<AgentAction | null>;
		markUndone(id: number, at: number): Promise<void>;
		/** Newest first. */
		recent(limit: number): Promise<AgentAction[]>;
		/** Id of the newest action, 0 when there is none. */
		latestId(): Promise<number>;
		/** Changes the agent made on its own (reacting to an event) after `id`, not undone, oldest first. */
		ownSince(id: number): Promise<AgentAction[]>;
		/** Whether any action was recorded after `at`. */
		anySince(at: number): Promise<boolean>;
	};

	events: {
		/** `null` when the key is already logged. */
		insert(event: NewEvent): Promise<number | null>;
		/** Not yet handled, oldest first. */
		unhandled(): Promise<EventRow[]>;
		settle(ids: number[], outcome: string, at: number): Promise<void>;
		/** Newest first. */
		recent(limit: number): Promise<EventRow[]>;
		/** Which of these keys are already logged. */
		knownKeys(keys: string[]): Promise<Set<string>>;
		/** Handled events created before `before` are removed. */
		prune(before: number): Promise<void>;
	};

	cards: {
		/** The newest card that is still open. */
		open(): Promise<Card | null>;
		/** Resolves every open card, then adds this one. */
		show(card: NewCard): Promise<Card>;
		/** `false` when there is no such open card. */
		resolve(id: number, at: number): Promise<boolean>;
		/** Resolved cards created before `before` are removed. */
		prune(before: number): Promise<void>;
	};

	schedule: {
		/** Pending entries, soonest first. */
		pending(): Promise<ScheduleEntry[]>;
		/** Pending entries that are on and due at `nowMs`, soonest first. */
		due(nowMs: number): Promise<ScheduleEntry[]>;
		insert(entry: NewEntry): Promise<ScheduleEntry>;
		update(
			id: number,
			patch: Partial<
				Pick<
					ScheduleEntry,
					'fireAt' | 'status' | 'enabled' | 'minutes' | 'repeat' | 'label' | 'tone' | 'durationMin'
				>
			>
		): Promise<void>;
		/** The entry when it was pending, `null` otherwise. */
		cancel(id: number): Promise<ScheduleEntry | null>;
		/** Done and cancelled entries that fired before `before` are removed. */
		prune(before: number): Promise<void>;
	};

	usage: {
		record(use: string, tokens: number, at: number): Promise<void>;
		tokensSince(since: number): Promise<number>;
		countSince(use: string, since: number): Promise<number>;
		timesSince(use: string, since: number): Promise<number[]>;
		/** Usage rows from before `before` are removed. */
		prune(before: number): Promise<void>;
	};

	settings: {
		get(): Promise<Settings>;
		update(patch: Partial<Settings>): Promise<Settings>;
	};
}
