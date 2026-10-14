import { TOOLS } from '#lib/assistant-tools.js';

/**
 * Every OpenAI call of the app is built here, so the rules cannot be bypassed from a call site:
 * Responses API, model gpt-6-luna, nothing stored on OpenAI's side, flex processing.
 */
export const OPENAI_URL = 'https://api.openai.com/v1/responses';
export const MODEL = 'gpt-6-luna';
export const SERVICE_TIER = 'flex';

export type Effort = 'low' | 'medium' | 'high';

/**
 * Reasoning effort is fixed per place the model is used, never chosen by the user.
 * `chat` is a user waiting for an answer, `reaction` a short glance at an event (phase 6),
 * `replan` a real rearrangement of the day (phase 6).
 */
export const EFFORT_BY_USE = {
	chat: 'medium',
	reaction: 'low',
	replan: 'high'
} as const satisfies Record<string, Effort>;

export type Use = keyof typeof EFFORT_BY_USE;

/** One output item of a response, passed back verbatim on the next round (nothing is stored server side). */
export interface OutputItem {
	type: string;
	call_id?: string;
	name?: string;
	arguments?: string;
	content?: { type: string; text?: string }[];
}

export interface ResponseBody {
	output: OutputItem[];
}

export function buildRequest(input: unknown[], instructions: string, use: Use) {
	return {
		model: MODEL,
		service_tier: SERVICE_TIER,
		store: false,
		// Without stored state the reasoning has to travel with the conversation
		include: ['reasoning.encrypted_content'],
		reasoning: { effort: EFFORT_BY_USE[use] },
		instructions,
		input,
		tools: TOOLS,
		max_output_tokens: 2000
	};
}

export function functionCalls(body: ResponseBody) {
	return body.output.filter((item) => item.type === 'function_call' && item.call_id && item.name);
}

export function outputText(body: ResponseBody) {
	return body.output
		.filter((item) => item.type === 'message')
		.flatMap((item) => item.content ?? [])
		.map((part) => part.text ?? '')
		.join('')
		.trim();
}
