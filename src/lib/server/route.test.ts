/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { error } from '@sveltejs/kit';
import { AssistantError } from '#lib/core/context.js';
import { handler } from '#lib/server/route.js';
import { resetDb } from '#test/db.js';
import { failureOf } from '#test/errors.js';
import { TEST_DATE, TEST_EMAIL, callRoute, makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);
afterEach(() => mock.restore());

describe('handler', () => {
	test('a guest gets 401 and the work never runs', async () => {
		let ran = false;
		const route = handler(() => ((ran = true), Response.json(true)));
		expect(await callRoute(route)).toMatchObject({
			status: 401,
			body: { message: 'Login required' }
		});
		expect(ran).toBe(false);
	});

	test('the work gets the signed in user and what the response carries comes back unchanged', async () => {
		const user = await makeUser();
		const route = handler(({ user }) => Response.json({ email: user.email }, { status: 201 }));
		expect(await callRoute(route, { user })).toMatchObject({
			status: 201,
			body: { email: TEST_EMAIL }
		});
	});

	test('the context reads the plan of the signed in user only', async () => {
		const user = await makeUser();
		await makeTask({ title: 'mine' });
		await makeUser({ email: 'other@example.com' });
		await makeTask({ email: 'other@example.com', title: 'not mine' });
		const route = handler(async ({ ctx }) =>
			Response.json((await ctx.repo.tasks.between(TEST_DATE, TEST_DATE)).map((task) => task.title))
		);
		expect((await callRoute(route, { user })).body).toEqual(['mine']);
	});

	test('the context is built once per request', async () => {
		const user = await makeUser();
		const route = handler((call) => Response.json(call.ctx === call.ctx));
		expect((await callRoute(route, { user })).body).toBe(true);
	});

	test('the request parts a route reads are passed on', async () => {
		const user = await makeUser();
		const route = handler(({ url, params }) =>
			Response.json({ query: url.searchParams.get('q'), id: params.id })
		);
		const result = await callRoute(route, { user, url: '/x?q=a', params: { id: '7' } });
		expect(result.body).toEqual({ query: 'a', id: '7' });
	});

	describe('json', () => {
		const echo = (fallback?: unknown) =>
			handler(async ({ json }) => Response.json({ body: await json(fallback) }));

		test('is the parsed body', async () => {
			const user = await makeUser();
			expect((await callRoute(echo(), { user, body: { a: 1 } })).body).toEqual({ body: { a: 1 } });
		});

		test('is null without a body when no fallback is given', async () => {
			const user = await makeUser();
			expect((await callRoute(echo(), { user, method: 'POST' })).body).toEqual({ body: null });
		});

		test('is the fallback without a body', async () => {
			const user = await makeUser();
			const result = await callRoute(echo({}), { user, method: 'POST' });
			expect(result.body).toEqual({ body: {} });
		});
	});

	describe('failures', () => {
		test('an AssistantError answers with its status and message', async () => {
			const user = await makeUser();
			const route = handler(() => {
				throw new AssistantError('No such thing', 404);
			});
			expect(await callRoute(route, { user })).toMatchObject({
				status: 404,
				body: { message: 'No such thing' }
			});
		});

		test('an AssistantError from async work answers the same way', async () => {
			const user = await makeUser();
			const route = handler(async () => {
				throw new AssistantError('Too long', 400);
			});
			expect((await callRoute(route, { user })).status).toBe(400);
		});

		test('any other error is not caught without a failure message', async () => {
			const user = await makeUser();
			const route = handler(() => {
				throw new Error('boom');
			});
			expect((await failureOf(callRoute(route, { user }))).message).toBe('boom');
		});

		test('with a failure message any other error is logged and answered as 500', async () => {
			const user = await makeUser();
			const log = spyOn(console, 'error').mockImplementation(() => {});
			const route = handler(
				() => {
					throw new Error('boom');
				},
				{ failure: { label: 'Thing error:', message: 'The thing failed' } }
			);
			expect(await callRoute(route, { user })).toMatchObject({
				status: 500,
				body: { message: 'The thing failed' }
			});
			expect(log).toHaveBeenCalledWith('Thing error:', expect.any(Error));
		});

		test('an error() the work raises keeps its status even with a failure message', async () => {
			const user = await makeUser();
			const route = handler(() => error(400, 'Nothing to say'), {
				failure: { label: 'Thing error:', message: 'The thing failed' }
			});
			expect(await callRoute(route, { user })).toMatchObject({
				status: 400,
				body: { message: 'Nothing to say' }
			});
		});

		test('an AssistantError keeps its own message even with a failure message', async () => {
			const user = await makeUser();
			const route = handler(
				() => {
					throw new AssistantError('Add your OpenAI key first', 400);
				},
				{ failure: { label: 'Thing error:', message: 'The thing failed' } }
			);
			expect((await callRoute(route, { user })).body).toMatchObject({
				message: 'Add your OpenAI key first'
			});
		});
	});
});
