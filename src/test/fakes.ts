/**
 * Fakes for the outside world. `fetch` is restored to the network guard after every test
 * (`#test/preload.ts`), so a fake never leaks into the next test.
 */
import type { Tool } from '#lib/assistant-tools.js';
import type { Model } from '#lib/core/context.js';
import { AssistantError } from '#lib/core/context.js';
import { MODEL, SERVICE_TIER, buildRequest, type ResponseBody, type Use } from '#lib/openai.js';
import { refuse } from '#test/network.js';

/** Answers one request. Throwing simulates a network error. */
export type FakeRoute = (request: Request) => Response | Promise<Response>;

/**
 * Replaces `fetch` for the current test. Routes are keyed by `'METHOD url'` or just `'url'`,
 * without the query string. Any other request fails the test.
 */
export function fakeFetch(routes: Record<string, FakeRoute>) {
	const requests: Request[] = [];
	const fake = async (input: RequestInfo | URL, init?: RequestInit) => {
		// The browser resolves a relative url against the page, so do the same
		const request = new Request(
			typeof input === 'string' ? new URL(input, 'http://localhost:5173') : input,
			init
		);
		const url = new URL(request.url);
		const bare = `${url.origin}${url.pathname}`;
		const route = routes[`${request.method} ${bare}`] ?? routes[bare];
		if (!route) return refuse(request.method, request.url);
		requests.push(request.clone());
		return route(request);
	};
	globalThis.fetch = Object.assign(fake, { preconnect: () => {} }) as typeof fetch;
	return { requests };
}

/** A reply with text only, the model is done. */
export const text = (content: string, tokens = 10): ResponseBody => ({
	output: [{ type: 'message', content: [{ type: 'output_text', text: content }] }],
	usage: { total_tokens: tokens }
});

/** A reply that asks for tools, `arguments` is turned into the JSON string OpenAI sends. */
export const toolCalls = (
	calls: { name: string; arguments?: unknown; id?: string }[],
	tokens = 10
): ResponseBody => ({
	output: calls.map((call, index) => ({
		type: 'function_call',
		call_id: call.id ?? `call-${index + 1}`,
		name: call.name,
		arguments:
			typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {})
	})),
	usage: { total_tokens: tokens }
});

/** A model call that fails the way the OpenAI adapter reports it. */
export const failure = (status = 502, message = 'OpenAI could not answer, try again') =>
	new AssistantError(message, status);

export interface ModelCall {
	/** A copy taken at the time of the call, the rules keep appending to the same array. */
	input: unknown[];
	instructions: string;
	use: Use;
	tools: Tool[] | undefined;
}

/**
 * A `Model` that answers from a queue, in order. An `Error` in the queue is thrown. Without an answer left it
 * replies with nothing, which ends a tool loop. Every call is recorded, so a test can look at the request.
 */
export function fakeModel(...answers: (ResponseBody | Error)[]) {
	const calls: ModelCall[] = [];
	const model: Model = {
		async complete(input, instructions, use, tools) {
			calls.push({ input: [...input], instructions, use, tools });
			const answer = answers[calls.length - 1] ?? { output: [] };
			if (answer instanceof Error) throw answer;
			return answer;
		}
	};
	return { model, calls };
}

/** A model that fails the test when anything calls it. For the paths that must stay silent. */
export function forbiddenModel() {
	const { model, calls } = fakeModel();
	return {
		calls,
		model: {
			complete: async (...args: Parameters<Model['complete']>) => {
				await model.complete(...args);
				throw new Error('the model must not be called here');
			}
		} satisfies Model
	};
}

/** The fixed rules every OpenAI request has to follow, checked against the body that would be sent. */
export function expectEveryRequestValid(
	call: Pick<ModelCall, 'input' | 'instructions' | 'use' | 'tools'>
) {
	const body = buildRequest(call.input, call.instructions, call.use, call.tools);
	if (body.model !== MODEL || body.store !== false || body.service_tier !== SERVICE_TIER)
		throw new Error('an OpenAI request broke the fixed rules');
	return body;
}

/**
 * A stand in for the Realtime WebSocket. The test drives it: `open()`, `receive(...)`, `fail()`, `drop()`.
 * `connect` is what `speak` takes, it remembers the url and the key it was opened with.
 */
class FakeWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 3;

	readyState: number = FakeWebSocket.CONNECTING;
	readonly sent: unknown[] = [];
	closed = false;
	onopen: (() => void) | null = null;
	onmessage: ((message: { data: unknown }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;

	constructor(
		readonly url: string,
		readonly key: string
	) {}

	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		this.closed = true;
		this.readyState = FakeWebSocket.CLOSED;
	}

	open() {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.();
	}
	receive(event: unknown) {
		this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
	}
	fail() {
		this.onerror?.();
	}
	drop() {
		this.readyState = FakeWebSocket.CLOSED;
		this.onclose?.();
	}
}

/** `connect` for `speak`, and the sockets it opened. */
export function fakeConnect() {
	const sockets: FakeWebSocket[] = [];
	const connect = (url: string, key: string) => {
		const socket = new FakeWebSocket(url, key);
		sockets.push(socket);
		return socket as unknown as WebSocket;
	};
	return { connect, sockets };
}
