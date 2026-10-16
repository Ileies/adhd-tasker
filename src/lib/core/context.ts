/**
 * What the core rules need from the world, handed in instead of imported: the user's storage, the
 * clock, the model, a way to tell open screens, and a way to ask the agent to look at new events.
 * The server builds one per request (`#lib/server/ctx.js`), a guest's device builds its own.
 */
import type { Tool } from '#lib/assistant-tools.js';
import type { ResponseBody, Use } from '#lib/openai.js';
import type { Tone } from '#lib/tones.js';
import type { Repo } from '#lib/core/repo.js';

/** Small messages to the open screens of the user. Hints only: a screen that misses one fetches the data itself. */
export type Hint =
	| { type: 'agent' }
	| { type: 'schedule' }
	/** To-dos changed, fetch them again. */
	| { type: 'todos' }
	/** Routines changed or made tasks, fetch them and the plan again. */
	| { type: 'routines' }
	/** The flow log got a row, fetch today's rows again. */
	| { type: 'flow' }
	| { type: 'alarm'; id: number; fireAt: number; label: string; tone: Tone; durationMin: number }
	| { type: 'tone'; tone: Tone }
	/** Something about Google Calendar to tell the user, the plan was read again. */
	| { type: 'calendar'; message: string };

/** Sends what `buildRequest` built and answers with the response. Errors are `AssistantError`s with a reason to show. */
export interface Model {
	complete(input: unknown[], instructions: string, use: Use, tools?: Tool[]): Promise<ResponseBody>;
}

export interface Ctx {
	repo: Repo;
	now(): number;
	/** `null` without an OpenAI key. The app works fully without one. */
	model: Model | null;
	/** How many screens received it. */
	hint(message: Hint): number;
	/** Asks the agent to look at the unhandled events shortly. */
	react(): void;
}

/** A failure with a reason the user can read and the HTTP status a route answers with. */
export class AssistantError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}
