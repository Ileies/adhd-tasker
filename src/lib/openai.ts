import { TOOLS, type Tool } from '#lib/assistant-tools.js';
import { AssistantError, type Model } from '#lib/core/context.js';

/**
 * Every OpenAI call of the app is built here, so the rules cannot be bypassed from a call site:
 * Responses API, model gpt-6-luna, nothing stored on OpenAI's side, flex processing.
 */
export const OPENAI_URL = 'https://api.openai.com/v1/responses';
export const MODEL = 'gpt-6-luna';
export const SERVICE_TIER = 'flex';
/** The cap includes the hidden reasoning tokens, OpenAI recommends reserving at least 25 000 for reasoning models. Replies stay short through the prompt. */
export const MAX_OUTPUT_TOKENS = 25_000;

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
	usage?: { total_tokens?: number };
}

/** The tool set varies by use (chat edits the plan, a reaction mostly talks), the rules above never do. */
export function buildRequest(
	input: unknown[],
	instructions: string,
	use: Use,
	tools: Tool[] = TOOLS
) {
	return {
		model: MODEL,
		service_tier: SERVICE_TIER,
		store: false,
		// With store false the response carries encrypted reasoning items by itself, they travel with the conversation
		reasoning: { effort: EFFORT_BY_USE[use] },
		instructions,
		input,
		tools,
		max_output_tokens: MAX_OUTPUT_TOKENS
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

/** Flex processing is cheaper but can be slow and is sometimes out of capacity (429), so wait longer and retry once. */
const FLEX_TIMEOUT_MS = 120_000;
const FLEX_RETRY_DELAY_MS = 3000;

/**
 * The model port on top of the Responses API, always through `buildRequest`. Runs on the server for
 * an account and in the browser for a guest, with the user's own key either way.
 */
export function openaiModel(key: string, retryDelayMs = FLEX_RETRY_DELAY_MS): Model {
	return {
		async complete(input, instructions, use, tools = TOOLS) {
			const body = JSON.stringify(buildRequest(input, instructions, use, tools));

			for (let attempt = 0; ; attempt++) {
				let response: Response;
				try {
					response = await fetch(OPENAI_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
						body,
						signal: AbortSignal.timeout(FLEX_TIMEOUT_MS)
					});
				} catch {
					throw new AssistantError('Could not reach OpenAI or it took too long', 502);
				}
				if (response.status === 401)
					throw new AssistantError('OpenAI rejected the saved key, check it in Settings', 400);
				if (response.status === 429 && attempt === 0) {
					await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
					continue;
				}
				if (response.status === 429)
					throw new AssistantError(
						'OpenAI is out of flex capacity or your quota is used up, try again later',
						429
					);
				if (!response.ok) throw new AssistantError('OpenAI could not answer, try again', 502);
				return response.json();
			}
		}
	};
}
