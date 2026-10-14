/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { reactionTools } from './assistant-tools';
import {
	EFFORT_BY_USE,
	OPENAI_URL,
	buildRequest,
	functionCalls,
	outputText,
	type Use
} from './openai';

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
