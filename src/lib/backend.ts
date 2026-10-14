/**
 * The one interface the UI talks to for everything that is stored or computed outside the page:
 * the plan, alarms, the assistant, the agent's feed, settings and voice. `remoteBackend`
 * (`#lib/remote-backend.js`) talks to this server, a guest's device gets its own implementation.
 * Components and routes never call `fetch`, they go through `tasker.backend`.
 */
import type { NewTask, Task } from '#lib/core/repo.js';
import type { Alarm, AgentCard, Wakeup } from '#lib/app.svelte.js';
import type { ChatMessage, Change } from '#lib/core/assistant.js';
import type { Repeat } from '#lib/schedule.js';
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
	tone: ToneName;
	repeat: Repeat;
	duration_minutes?: number;
}

/** What the agent did on its own since the cursor: the open cards and the plan changes it made. */
export interface AgentFeed {
	cursor: number;
	cards: AgentCard[];
	changes: { id: number; summary: string; dates: string[] }[];
}

export interface Backend {
	tasks: {
		/** Every task of one day. */
		load(date: string): Promise<Task[]>;
		create(task: NewTask): Promise<Task>;
		update(task: Task): Promise<void>;
		delete(id: number): Promise<void>;
	};
	schedule: {
		/** `null` when the backend refused to list them. */
		load(): Promise<{ alarms: Alarm[]; wakeups: Wakeup[] } | null>;
		addAlarm(fields: AlarmFields): Promise<void>;
		remove(id: number): Promise<void>;
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
	settings: {
		saveTimezone(timezone: string): Promise<void>;
	};
	voice: {
		/** The recognized text. */
		transcribe(audio: Blob): Promise<string>;
		/** The audio to play, `null` when nothing could be made. */
		speak(text: string): Promise<Blob | null>;
	};
}
