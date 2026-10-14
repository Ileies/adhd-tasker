/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { reactionTools } from './assistant-tools';
import { EFFORT_BY_USE, OPENAI_URL, buildRequest, functionCalls, outputText, type Use } from './openai';

describe('buildRequest', () => {
	for (const use of Object.keys(EFFORT_BY_USE) as Use[]) {
		test(`always enforces the fixed settings for ${use}`, () => {
			const request = buildRequest([{ role: 'user', content: 'hi' }], 'be brief', use);
			expect(request.model).toBe('gpt-6-luna');
			expect(request.store).toBe(false);
			expect(request.service_tier).toBe('flex');
			expect(request.reasoning).toEqual({ effort: EFFORT_BY_USE[use] });
			expect(request.include).toContain('reasoning.encrypted_content');
			expect(request.tools.every((tool) => tool.type === 'function' && typeof tool.name === 'string')).toBe(true);
		});
	}

	test('a different tool set never loosens the fixed settings', () => {
		const request = buildRequest([], '', 'reaction', reactionTools(false));
		expect(request.model).toBe('gpt-6-luna');
		expect(request.store).toBe(false);
		expect(request.service_tier).toBe('flex');
		expect(request.tools.map((tool) => tool.name)).toEqual(['list_tasks', 'say', 'ask']);
		expect(buildRequest([], '', 'reaction', reactionTools(true)).tools.map((tool) => tool.name)).toContain('update_task');
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
		expect(buildRequest([], '', 'replan').reasoning.effort).toBe('high');
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
