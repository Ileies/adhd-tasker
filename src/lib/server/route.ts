import { error, isHttpError, isRedirect, type RequestEvent } from '@sveltejs/kit';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { serverCtx } from '#lib/server/ctx.js';

/** What a route's work gets: the parts of the request it reads, the signed in user and that account's core context. */
export type Call<E extends RequestEvent> = Pick<
	E,
	'request' | 'url' | 'params' | 'cookies' | 'getClientAddress'
> & {
	user: NonNullable<App.Locals['user']>;
	/** Built on first use, so a route that never touches the plan does not open the account's repo. */
	readonly ctx: Ctx;
	/** The JSON body, `fallback` when it is missing or not JSON. */
	json(fallback?: unknown): ReturnType<Request['json']>;
};

/** For a route whose model call can fail in ways the user cannot fix: logged with `label`, answered as 500 with `message`. */
export interface Failure {
	label: string;
	message: string;
}

/**
 * A route that needs a login. A guest gets 401 before anything runs, an `AssistantError` thrown by the work
 * answers with its own status and message, and with `failure` any other error answers 500 instead of leaking.
 * Routes that cannot work like this (login, callback, logout, the stream) stay hand written.
 */
export function handler<E extends RequestEvent>(
	work: (call: Call<E>) => Response | Promise<Response>,
	{ failure }: { failure?: Failure } = {}
) {
	return async (event: E): Promise<Response> => {
		const { user } = event.locals;
		if (!user) error(401, 'Login required');

		let ctx: Ctx | undefined;
		const call: Call<E> = {
			request: event.request,
			url: event.url,
			params: event.params,
			cookies: event.cookies,
			getClientAddress: event.getClientAddress,
			user,
			get ctx() {
				return (ctx ??= serverCtx(user.email));
			},
			json: (fallback = null) => event.request.json().catch(() => fallback)
		};

		try {
			return await work(call);
		} catch (thrown) {
			if (thrown instanceof AssistantError) error(thrown.status as 400, thrown.message);
			if (!failure || isHttpError(thrown) || isRedirect(thrown)) throw thrown;
			console.error(failure.label, thrown);
			error(500, failure.message);
		}
	};
}
