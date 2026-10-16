/// <reference types="bun" />
import { beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { AssistantError } from '#lib/core/context.js';
import { OPENAI_URL } from '#lib/openai.js';
import { runAssistant, suggestSteps } from '#lib/server/assistant.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/ctx.js';
import { encrypt } from '#lib/server/crypto.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { failureOf } from '#test/errors.js';
import { fakeFetch, text } from '#test/fakes.js';
import { makeUser } from '#test/fixtures.js';

const NOW = Date.parse('2026-10-14T09:00:00Z');
const route = `POST ${OPENAI_URL}`;
const hi = [{ role: 'user' as const, content: 'hi' }];
const sealed = (key: string) => encrypt(key, 'test-secret', OPENAI_KEY_PURPOSE);

/** The rate limits remember an email for the whole run, so every test gets its own account. */
let seq = 0;
const account = (extra: Parameters<typeof makeUser>[0] = {}) =>
	makeUser({ email: `user${++seq}@example.com`, ...extra });

beforeEach(async () => {
	await resetDb();
	setSystemTime(new Date(NOW));
});

describe('suggestSteps (account)', () => {
	const steps = {
		output: [
			{
				type: 'function_call',
				call_id: 'c1',
				name: 'suggest_steps',
				arguments: JSON.stringify({ steps: [{ title: 'Pack ID', minutes: 5 }] })
			}
		],
		usage: { total_tokens: 12 }
	};
	const appointment = (email: string) =>
		dbRepo(email).tasks.insert({
			title: 'Exam',
			description: '',
			date: '2026-10-16',
			startTime: 720,
			duration: 60,
			priority: 3,
			kind: 'appointment'
		});

	test('asks the model with the saved key as the prep use and writes nothing', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		const exam = await appointment(user.email);
		const { requests } = fakeFetch({ [route]: () => Response.json(steps) });
		expect(await suggestSteps(user.email, exam.id)).toEqual({
			steps: [{ title: 'Pack ID', minutes: 5 }]
		});
		expect(requests[0].headers.get('authorization')).toBe('Bearer sk-saved');
		expect(await requests[0].json()).toMatchObject({
			store: false,
			reasoning: { effort: 'low' },
			tool_choice: { type: 'function', name: 'suggest_steps' }
		});
		expect(await dbRepo(user.email).todos.all()).toEqual([]);
	});

	test('without a key nothing is sent', async () => {
		const user = await account();
		const exam = await appointment(user.email);
		const { requests } = fakeFetch({});
		expect(await failureOf(suggestSteps(user.email, exam.id))).toMatchObject({ status: 400 });
		expect(requests).toEqual([]);
	});

	test('the eleventh in five minutes is 429, and it has its own window apart from the chat', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		const exam = await appointment(user.email);
		fakeFetch({ [route]: () => Response.json(steps) });
		for (let i = 0; i < 10; i++) await suggestSteps(user.email, exam.id);
		expect(await failureOf(suggestSteps(user.email, exam.id))).toMatchObject({ status: 429 });
		fakeFetch({ [route]: () => Response.json(text('ok')) });
		expect(await runAssistant(user.email, hi)).toMatchObject({ reply: 'ok' });
	});
});

describe('runAssistant (account)', () => {
	test('answers with the saved key, sent as the bearer token and never stored plain', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		const { requests } = fakeFetch({ [route]: () => Response.json(text('Hello')) });
		expect(await runAssistant(user.email, hi)).toEqual({ reply: 'Hello', changes: [] });
		expect(requests[0].headers.get('authorization')).toBe('Bearer sk-saved');
		const body = await requests[0].json();
		expect(body).toMatchObject({ model: 'gpt-6-luna', store: false, service_tier: 'flex' });
	});

	test('the account without a key is asked to add one and nothing is sent', async () => {
		const user = await account();
		const { requests } = fakeFetch({});
		expect(await failureOf(runAssistant(user.email, hi))).toMatchObject({
			status: 400,
			message: expect.stringContaining('OpenAI key')
		});
		expect(requests).toEqual([]);
	});

	test('a key encrypted with another secret is treated as no key', async () => {
		const user = await account({
			openaiKey: encrypt('sk-x', 'another-secret', OPENAI_KEY_PURPOSE)
		});
		fakeFetch({});
		expect(await failureOf(runAssistant(user.email, hi))).toMatchObject({ status: 400 });
	});

	test('a conversation that ends with the assistant is refused before the limit counts it', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		fakeFetch({});
		const ended = [...hi, { role: 'assistant' as const, content: 'ok' }];
		for (let i = 0; i < 25; i++)
			expect(await failureOf(runAssistant(user.email, ended))).toMatchObject({ status: 400 });
	});

	test('the 21st request in five minutes is 429 and the window frees up again', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		fakeFetch({ [route]: () => Response.json(text('ok')) });
		for (let i = 0; i < 20; i++) await runAssistant(user.email, hi);
		const error = await failureOf(runAssistant(user.email, hi));
		expect(error).toBeInstanceOf(AssistantError);
		expect(error).toMatchObject({ status: 429 });

		setSystemTime(new Date(NOW + 5 * 60_000 + 1));
		expect(await runAssistant(user.email, hi)).toMatchObject({ reply: 'ok' });
	});

	test('the limit is per account', async () => {
		const ada = await account({ openaiKey: sealed('sk-a') });
		const bob = await account({ openaiKey: sealed('sk-b') });
		fakeFetch({ [route]: () => Response.json(text('ok')) });
		for (let i = 0; i < 20; i++) await runAssistant(ada.email, hi);
		await failureOf(runAssistant(ada.email, hi));
		expect(await runAssistant(bob.email, hi)).toMatchObject({ reply: 'ok' });
	});

	test("a change the model makes lands in this account's rows only", async () => {
		const ada = await account({ openaiKey: sealed('sk-a') });
		const bob = await account();
		const add = {
			output: [
				{
					type: 'function_call',
					call_id: 'c1',
					name: 'add_task',
					arguments: JSON.stringify({ title: 'Run', date: '2026-10-14', start: '18:00' })
				}
			]
		};
		let calls = 0;
		fakeFetch({ [route]: () => Response.json(calls++ === 0 ? add : text('Added')) });
		const answer = await runAssistant(ada.email, hi);
		expect(answer.changes).toHaveLength(1);
		expect(await dbRepo(ada.email).tasks.between('2026-10-14', '2026-10-14')).toHaveLength(1);
		expect(await dbRepo(bob.email).tasks.between('2026-10-14', '2026-10-14')).toEqual([]);
	});

	test('the open screens are told about the agent edit only through events, not by this call', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		fakeFetch({ [route]: () => Response.json(text('ok')) });
		await runAssistant(user.email, hi);
		expect((await dbRepo(user.email).events.recent(1))[0]).toMatchObject({
			type: 'user.message',
			outcome: 'answered in the chat'
		});
	});
});
