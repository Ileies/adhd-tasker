/**
 * The one interface the UI talks to for everything that is stored or computed outside the page:
 * the plan, alarms, the assistant, the agent's feed, settings and voice. `remoteBackend`
 * (`#lib/remote-backend.js`) talks to this server, a guest's device gets its own implementation.
 * Components and routes never call `fetch`, they go through `tasker.backend`.
 */
import type { FlowRow, FlowType, NewTask, Task, Todo, TodoPatch } from '#lib/core/repo.js';
import type { Alarm, Wakeup } from '#lib/app.svelte.js';
import type { ChatMessage, Change } from '#lib/core/assistant.js';
import type {
	AllDayLine,
	CalendarImport,
	CalendarOverview,
	ImportMode,
	Preview
} from '#lib/core/calendar.js';
import type { ActivityView } from '#lib/core/activity.js';
import type { ExportFile, ImportResult } from '#lib/core/export.js';
import type { AgentFeed } from '#lib/core/feed.js';
import type { MoveMode, MoveResult, SnapshotInfo } from '#lib/core/merge.js';
import type { Place } from '#lib/location.js';
import type { Repeat } from '#lib/schedule.js';
import type { ClientSettings, SettingsPatch } from '#lib/settings.js';
import type { ToneName } from '#lib/tones.js';

/** A failure with a reason to show. `status` is the HTTP status, `null` when nothing could be reached. */
export class BackendError extends Error {
	constructor(
		message: string,
		readonly status: number | null
	) {
		super(message);
	}
}

export interface AlarmFields {
	/** A clock time for a daily or one-off alarm. */
	at?: string;
	/** A timer from now, it cannot repeat. */
	in_minutes?: number;
	label: string;
	/** Left out on an edit, the alarm keeps the tone it has. */
	tone?: ToneName;
	repeat: Repeat;
	duration_minutes?: number;
}

/** One answer for the flow log. `at` is this device's clock, the backend only believes it within two minutes. */
export interface FlowAnswer {
	type: FlowType;
	todoId?: number | null;
	taskId?: number | null;
	data?: Record<string, unknown>;
	key?: string;
	at?: number;
}

export interface Backend {
	tasks: {
		/** Every task of one day. */
		load(date: string): Promise<Task[]>;
		/** Every task from one day on, for the first look after a load. */
		since(date: string): Promise<Task[]>;
		create(task: NewTask): Promise<Task>;
		update(task: Task): Promise<void>;
		delete(id: number): Promise<void>;
	};
	todos: {
		/** Every open to-do and the ones finished in the last day and a half. */
		load(): Promise<Todo[]>;
		/** Rejects with the reason when a field is invalid. */
		create(fields: TodoPatch): Promise<Todo>;
		/** The to-do as stored after the change (done fills the bar). Rejects with the reason. */
		update(fields: TodoPatch & { id: number }): Promise<Todo>;
		delete(id: number): Promise<void>;
	};
	flow: {
		/** The answers given on one day (`YYYY-MM-DD` in the user's timezone), oldest first. */
		load(date: string): Promise<FlowRow[]>;
		/** Logs one answer. `null` when its key was logged already (a pick two screens made at once). */
		record(answer: FlowAnswer): Promise<FlowRow | null>;
	};
	schedule: {
		/** `null` when the backend refused to list them. */
		load(): Promise<{ alarms: Alarm[]; wakeups: Wakeup[] } | null>;
		addAlarm(fields: AlarmFields): Promise<void>;
		remove(id: number): Promise<void>;
		/** Turns an alarm on or off, it stays listed. Rejects with the reason (a timer that ran out cannot come back). */
		setEnabled(id: number, enabled: boolean): Promise<void>;
		/** Changes what an alarm says, when it rings, its repeat and tone. Rejects with the reason. */
		updateAlarm(id: number, fields: AlarmFields): Promise<void>;
		/** `null` lets every device play again. */
		chooseDisplay(device: string | null): Promise<void>;
	};
	assistant: {
		chat(messages: ChatMessage[]): Promise<{ reply: string; changes: Change[] }>;
		/** The dates the plan has to refresh. */
		undo(id: number): Promise<{ dates: string[] }>;
	};
	agent: {
		/** `null` when the backend refused. `since` is the last action id seen, `null` before the first poll. */
		feed(since: number | null): Promise<AgentFeed | null>;
		resolveCard(id: number): Promise<void>;
		stuck(taskId: number, reason: string): Promise<void>;
	};
	activity: {
		/** What the assistant changed, the events it saw and today's token use. */
		load(): Promise<ActivityView>;
	};
	settings: {
		/** What the screens show and the forms start from. */
		load(): Promise<ClientSettings>;
		saveTimezone(timezone: string): Promise<void>;
		/** Cities that match a typed name, for the daylight theme. Rejects with the reason when the search could not run. */
		searchPlaces(query: string): Promise<Place[]>;
		/** Checks the key with OpenAI, then stores it (encrypted on the server, plain on a guest's device). Rejects with the reason. */
		saveKey(key: string): Promise<void>;
		removeKey(): Promise<void>;
		/** Stores the changed settings. Rejects with the reason when a value is out of range. */
		save(patch: SettingsPatch): Promise<void>;
	};
	data: {
		/** Everything the user may take with them, as the export file. */
		export(): Promise<ExportFile>;
		/** Adds what an export file holds. Rejects with the reason when it is not a valid file. */
		import(raw: unknown): Promise<ImportResult>;
		/** Deletes everything stored on this device, or for an account the account itself with every row of it. */
		erase(): Promise<void>;
	};
	account: {
		/**
		 * Moves a device's plan, as the export file, into the account (`today` is the day in the account's timezone).
		 * Rejects with the reason when a row is invalid, then nothing was changed.
		 */
		move(file: ExportFile, mode: MoveMode, today: string): Promise<MoveResult>;
		/** The plans of the account that can be brought back, newest first. */
		snapshots(): Promise<SnapshotInfo[]>;
		/** Brings a snapshot back. What is there now becomes a snapshot itself. */
		restore(id: number): Promise<MoveResult>;
	};
	calendar: {
		/** Whether Calendar is linked, where the link is and the calendars to choose from. A device has none. */
		overview(): Promise<CalendarOverview>;
		/** What is coming in the chosen calendars and how much clashes with the plan. Changes nothing. */
		preview(calendars: string[]): Promise<Preview>;
		/** The first import, after the preview. Rejects with the reason when it was not previewed. */
		import(mode: ImportMode): Promise<CalendarImport>;
		/** Follows the calendars now, `true` when the plan changed. */
		sync(): Promise<boolean>;
		/** Stops following the calendars. Tasks already imported stay. */
		stop(): Promise<void>;
		/** Where the user's own tasks are added too, `null` turns it off. Rejects with the reason when it was not kept. */
		setWrite(calendarId: string | null): Promise<void>;
		/** The all-day events from `from` to `to` inclusive, one line each on Plan. */
		allDay(from: string, to: string): Promise<AllDayLine[]>;
	};
	sample: {
		/** The sample tasks still in the plan. Only a guest's device makes a sample day, so an account has none. */
		ids(): Promise<number[]>;
		/** Adds the sample day around `minutes` (since midnight) of `today`, marks what it added and answers it. */
		start(today: string, minutes: number): Promise<Task[]>;
		/** Removes exactly the tasks the sample day added, answers how many were still there. */
		clear(): Promise<number>;
		/** Makes the sample tasks the user's own: they stay in the plan and are no longer marked as a sample. */
		keep(): Promise<void>;
	};
	voice: {
		/** The recognized text. */
		transcribe(audio: Blob): Promise<string>;
		/** The audio to play, `null` when nothing could be made. */
		speak(text: string): Promise<Blob | null>;
	};
}
