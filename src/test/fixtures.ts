/**
 * Real rows with calm defaults, and request events for calling route handlers directly.
 * Database fixtures need `resetDb()` from `#test/db.js` in `beforeEach`.
 */
import { isHttpError, isRedirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { tasks, users } from '#lib/server/db/schema.js';
import { Priority, TaskStatus } from '#lib/types.js';

export const TEST_EMAIL = 'ada@example.com';
export const TEST_DATE = '2026-10-14';

type User = typeof users.$inferSelect;
type Task = typeof tasks.$inferSelect;

export async function makeUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<User> {
	const [user] = await db
		.insert(users)
		.values({ email: TEST_EMAIL, timezone: 'Europe/Berlin', ...overrides })
		.returning();
	return user;
}

/** Inserts a task, creating its owner first when there is none. */
export async function makeTask(overrides: Partial<typeof tasks.$inferInsert> = {}): Promise<Task> {
	const email = overrides.email ?? TEST_EMAIL;
	await db.insert(users).values({ email, timezone: 'Europe/Berlin' }).onConflictDoNothing();
	const [task] = await db
		.insert(tasks)
		.values({
			title: 'Write intro',
			description: '',
			date: TEST_DATE,
			startTime: 9 * 60,
			duration: 60,
			priority: Priority.Medium,
			status: TaskStatus.Pending,
			...overrides,
			email
		})
		.returning();
	return task;
}

export type CookieCall =
	| { op: 'set'; name: string; value: string; opts: unknown }
	| { op: 'delete'; name: string; opts: unknown };

/** In-memory cookies that record every `set` and `delete` with their options. */
export class FakeCookies implements Cookies {
	readonly jar: Map<string, string>;
	readonly calls: CookieCall[] = [];

	constructor(initial: Record<string, string> = {}) {
		this.jar = new Map(Object.entries(initial));
	}

	get = (name: string) => this.jar.get(name);
	getAll = () => [...this.jar].map(([name, value]) => ({ name, value }));
	set = (name: string, value: string, opts?: unknown) => {
		this.jar.set(name, value);
		this.calls.push({ op: 'set', name, value, opts });
	};
	delete = (name: string, opts?: unknown) => {
		this.jar.delete(name);
		this.calls.push({ op: 'delete', name, opts });
	};
	parse = (): never => {
		throw new Error('FakeCookies.parse is not implemented');
	};
	serialize = (name: string, value: string) => `${name}=${encodeURIComponent(value)}`;
}

export type RequestInit = {
	user?: User;
	method?: string;
	url?: string;
	/** A plain object is sent as JSON, `FormData` as a form. */
	body?: unknown;
	params?: Record<string, string>;
	cookies?: Record<string, string>;
	headers?: Record<string, string>;
};

/** What a route handler receives, with `locals.user` already resolved as `hooks.server.ts` would. */
export function requestEvent(init: RequestInit = {}) {
	const url = new URL(init.url ?? '/', 'http://localhost:5173');
	const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
	const headers = new Headers(init.headers);
	let body: BodyInit | undefined;
	if (init.body instanceof FormData) body = init.body;
	else if (init.body !== undefined) {
		body = JSON.stringify(init.body);
		headers.set('content-type', 'application/json');
	}
	const cookies = new FakeCookies(init.cookies);
	const event = {
		cookies,
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		locals: { user: init.user },
		params: init.params ?? {},
		platform: undefined,
		request: new Request(url, { method, headers, body }),
		route: { id: url.pathname },
		setHeaders: () => {},
		url,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false
	};
	return event as unknown as RequestEvent & { cookies: FakeCookies };
}

export type RouteResult = { status: number; body: unknown; headers: Headers };

/**
 * Calls a handler and reads its response. A thrown `error()` or `redirect()` becomes a result
 * like the one SvelteKit would send, so tests assert on status and body either way.
 */
export async function callRoute<Event>(
	handler: (event: Event) => Response | Promise<Response>,
	init: RequestInit | ReturnType<typeof requestEvent> = {}
): Promise<RouteResult> {
	const event = 'request' in init ? init : requestEvent(init);
	try {
		const response = await handler(event as Event);
		const type = response.headers.get('content-type') ?? '';
		const body = type.includes('json') ? await response.json() : await response.text();
		return { status: response.status, body, headers: response.headers };
	} catch (thrown) {
		if (isHttpError(thrown))
			return { status: thrown.status, body: thrown.body, headers: new Headers() };
		if (isRedirect(thrown))
			return {
				status: thrown.status,
				body: null,
				headers: new Headers({ location: thrown.location })
			};
		throw thrown;
	}
}
