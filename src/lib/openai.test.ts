/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { AssistantError } from '#lib/core/context.js';
import { fakeFetch } from '#test/fakes.js';
import { PREP_TOOLS, reactionTools } from '#lib/assistant-tools.js';
import {
	EFFORT_BY_USE,
	OPENAI_URL,
	buildRequest,
	functionCalls,
	outputText,
	openaiModel,
	type Use
} from '#lib/openai.js';

describe('buildRequest', () => {
	for (const use of Object.keys(EFFORT_BY_USE) as Use[]) {
		test(`always enforces the fixed settings for ${use}`, () => {
			const request = buildRequest([{ role: 'user', content: 'hi' }], 'be brief', use);
			expect(request.model).toBe('gpt-6-luna');
			expect(request.store).toBe(false);
			expect(request.service_tier).toBe('flex');
			expect(request.reasoning).toEqual({ effort: EFFORT_BY_USE[use] });
			expect(request.max_output_tokens).toBeGreaterThanOrEqual(25_000);
			expect(
				request.tools.every((tool) => tool.type === 'function' && typeof tool.name === 'string')
			).toBe(true);
		});
	}

	test('a different tool set never loosens the fixed settings', () => {
		const request = buildRequest([], '', 'reaction', reactionTools(false));
		expect(request.model).toBe('gpt-6-luna');
		expect(request.store).toBe(false);
		expect(request.service_tier).toBe('flex');
		const names = request.tools.map((tool) => tool.name);
		expect(names).toEqual([
			'list_tasks',
			'list_todos',
			'list_routines',
			'say',
			'ask',
			'schedule_wakeup',
			'play_tone',
			'cancel_schedule'
		]);
		expect(names).not.toContain('update_task');
		expect(names).not.toContain('set_alarm');
		const acting = buildRequest([], '', 'reaction', reactionTools(true)).tools.map(
			(tool) => tool.name
		);
		expect(acting).toContain('update_task');
		expect(acting).toContain('set_alarm');
		expect(buildRequest([], '', 'chat').tools.map((tool) => tool.name)).not.toContain('say');
	});

	test('uses the Responses API endpoint', () => {
		expect(OPENAI_URL).toBe('https://api.openai.com/v1/responses');
	});
});

describe('efforts per use', () => {
	test('differ by place and stay within low, medium, high', () => {
		expect(buildRequest([], '', 'reaction').reasoning.effort).toBe('low');
		expect(buildRequest([], '', 'chat').reasoning.effort).toBe('medium');
		expect(buildRequest([], '', 'prep').reasoning.effort).toBe('low');
		expect(buildRequest([], '', 'replan').reasoning.effort).toBe('high');
	});
});

describe('the prep use', () => {
	test('has to answer through its one tool and keeps the fixed settings', () => {
		const request = buildRequest([], '', 'prep', PREP_TOOLS);
		expect(request).toMatchObject({
			model: 'gpt-6-luna',
			store: false,
			service_tier: 'flex',
			tool_choice: { type: 'function', name: 'suggest_steps' }
		});
		expect(request.tools.map((tool) => tool.name)).toEqual(['suggest_steps']);
	});

	test('no other use forces a tool', () => {
		for (const use of ['chat', 'reaction', 'replan'] as const)
			expect(buildRequest([], '', use)).not.toHaveProperty('tool_choice');
	});
});

describe('response parsing', () => {
	const body = {
		output: [
			{ type: 'reasoning' },
			{ type: 'function_call', call_id: 'c1', name: 'add_task', arguments: '{}' },
			{ type: 'message', content: [{ type: 'output_text', text: ' Done. ' }] }
		]
	};

	test('finds function calls and text', () => {
		expect(functionCalls(body).map((call) => call.call_id)).toEqual(['c1']);
		expect(outputText(body)).toBe('Done.');
	});
});

describe('openaiModel', () => {
	const ask = (model = openaiModel('sk-test', 0)) =>
		model.complete([{ role: 'user', content: 'hi' }], 'be brief', 'chat');
	const answer =
		(status: number, body: unknown = { output: [] }) =>
		() =>
			Response.json(body, { status });

	test('sends the built request with the key and returns the response', async () => {
		const { requests } = fakeFetch({
			[`POST ${OPENAI_URL}`]: answer(200, { output: [{ type: 'message' }] })
		});
		expect(await ask()).toEqual({ output: [{ type: 'message' }] });
		expect(requests[0].headers.get('authorization')).toBe('Bearer sk-test');
		expect((await requests[0].json()).store).toBe(false);
	});

	const failures: [string, number, number, string][] = [
		['a rejected key', 401, 400, 'rejected the saved key'],
		['a server error', 500, 502, 'could not answer']
	];
	for (const [name, upstream, status, reason] of failures) {
		test(`${name} becomes an AssistantError with a reason`, async () => {
			fakeFetch({ [`POST ${OPENAI_URL}`]: answer(upstream) });
			const error = await ask().catch((e) => e);
			expect(error).toBeInstanceOf(AssistantError);
			expect(error.status).toBe(status);
			expect(error.message).toContain(reason);
		});
	}

	test('a lost connection says so', async () => {
		fakeFetch({
			[`POST ${OPENAI_URL}`]: () => {
				throw new Error('offline');
			}
		});
		const error = await ask().catch((e) => e);
		expect(error).toMatchObject({
			status: 502,
			message: expect.stringContaining('Could not reach')
		});
	});

	test('one 429 is retried, a second one is reported', async () => {
		let calls = 0;
		fakeFetch({ [`POST ${OPENAI_URL}`]: () => (++calls === 1 ? answer(429)() : answer(200)()) });
		await ask();
		expect(calls).toBe(2);

		calls = -10;
		fakeFetch({ [`POST ${OPENAI_URL}`]: () => (calls++, answer(429)()) });
		const error = await ask().catch((e) => e);
		expect(error.status).toBe(429);
		expect(calls).toBe(-8);
	});
});
