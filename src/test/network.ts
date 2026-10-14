/**
 * Tests never reach the network. `fetch` is a guard that refuses every request unless a test
 * installed a fake (`fakeFetch` in `#test/fakes.ts`), and every refused request fails the test,
 * even when the code under test swallowed the error.
 */

/** Requests no fake answered since the last check. */
const refused: string[] = [];

/** Records a request nothing should have made and throws, so the caller fails as offline code would. */
export function refuse(method: string, url: string): never {
	refused.push(`${method} ${url}`);
	throw new Error(`network access in a test: ${method} ${url}`);
}

/** Rejects like an offline `fetch` would. */
async function guard(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const request = new Request(input, init);
	return refuse(request.method, request.url);
}

/** Puts the guard back in place of `fetch`. */
export function blockNetwork() {
	globalThis.fetch = Object.assign(guard, { preconnect: () => {} }) as typeof fetch;
}

/** Throws when a request was refused since the last call, then forgets it. */
export function assertNoRefusedRequests() {
	if (!refused.length) return;
	const list = refused.splice(0).join(', ');
	throw new Error(`a test tried to reach the network: ${list}`);
}
