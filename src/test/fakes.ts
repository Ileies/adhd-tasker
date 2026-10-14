/**
 * Fakes for the outside world. `fetch` is restored to the network guard after every test
 * (`#test/preload.ts`), so a fake never leaks into the next test.
 */
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
