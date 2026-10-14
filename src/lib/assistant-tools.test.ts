/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	MAX_SAY,
	TOOLS,
	parseAddTask,
	parseAsk,
	parseDeleteTask,
	parseListTasks,
	parseReason,
	parseSay,
	parseToolArguments,
	parseUpdateTask
} from '#lib/assistant-tools.js';

describe('strict tool schemas', () => {
	type Schema = {
		type?: unknown;
		properties?: Record<string, Schema>;
		required?: string[];
		additionalProperties?: boolean;
		anyOf?: Schema[];
		items?: Schema;
	};

	function expectStrict(schema: Schema) {
		if (schema.type === 'object') {
			expect(schema.additionalProperties).toBe(false);
			expect(schema.required?.toSorted()).toEqual(Object.keys(schema.properties ?? {}).toSorted());
			Object.values(schema.properties ?? {}).forEach(expectStrict);
		}
		schema.anyOf?.forEach(expectStrict);
		if (schema.items) expectStrict(schema.items);
	}

	test('every tool is strict, every field required and the optional ones nullable', () => {
		for (const tool of TOOLS) {
			expect(tool.strict).toBe(true);
			expectStrict(tool.parameters as Schema);
		}
		const update = TOOLS.find((tool) => tool.name === 'update_task')!.parameters as Schema;
		expect(update.properties!.id.type).toBe('integer');
		expect(update.properties!.title.type).toEqual(['string', 'null']);
	});

	test('null means not sent, also inside a custom tone', () => {
		expect(
			parseToolArguments(
				'{"id":3,"title":null,"tone":{"wave":"sine","notes":[{"hz":440,"ms":100,"rest":null}]}}'
			)
		).toEqual({
			id: 3,
			tone: { wave: 'sine', notes: [{ hz: 440, ms: 100 }] }
		});
		expect(parseToolArguments('')).toEqual({});
		expect(parseToolArguments('nope')).toBeUndefined();
		expect(parseToolArguments('[1]')).toBeUndefined();
	});
});

describe('say, ask and reason', () => {
	test('say needs short text', () => {
		expect(parseSay({ text: ' Call done? ' })).toEqual({ ok: true, value: { text: 'Call done?' } });
		expect(parseSay({ text: '' }).ok).toBe(false);
		expect(parseSay({ text: 'x'.repeat(MAX_SAY + 1) }).ok).toBe(false);
	});

	test('ask accepts up to three short options', () => {
		expect(parseAsk({ text: 'Move study?', options: ['Yes', ' Not now '] })).toEqual({
			ok: true,
			value: { text: 'Move study?', options: ['Yes', 'Not now'] }
		});
		expect(parseAsk({ text: 'Move study?' })).toEqual({
			ok: true,
			value: { text: 'Move study?', options: [] }
		});
		expect(parseAsk({ text: 'q', options: ['a', 'b', 'c', 'd'] }).ok).toBe(false);
		expect(parseAsk({ text: 'q', options: [''] }).ok).toBe(false);
		expect(parseAsk({ text: 'q', options: 'yes' }).ok).toBe(false);
	});

	test('reason is optional and capped', () => {
		expect(parseReason(undefined)).toBe(null);
		expect(parseReason('  ')).toBe(null);
		expect(parseReason('x'.repeat(500))).toHaveLength(200);
	});
});

describe('parseAddTask', () => {
	test('reads HH:MM and applies defaults', () => {
		const result = parseAddTask({ title: ' Dinner ', date: '2026-10-14', start: '19:30' });
		expect(result).toEqual({
			ok: true,
			value: {
				title: 'Dinner',
				description: '',
				date: '2026-10-14',
				startTime: 1170,
				duration: 30,
				priority: 2
			}
		});
	});

	test('rejects bad input', () => {
		expect(parseAddTask({ title: '', date: '2026-10-14', start: '19:30' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: 'tomorrow', start: '19:30' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '25:00' }).ok).toBe(false);
		expect(parseAddTask({ title: 'x', date: '2026-10-14', start: '19:30', priority: 9 }).ok).toBe(
			false
		);
		expect(
			parseAddTask({ title: 'x', date: '2026-10-14', start: '19:30', duration_minutes: 2 }).ok
		).toBe(false);
	});

	test('rejects tasks that cross midnight', () => {
		expect(
			parseAddTask({ title: 'x', date: '2026-10-14', start: '23:30', duration_minutes: 60 }).ok
		).toBe(false);
		expect(
			parseAddTask({ title: 'x', date: '2026-10-14', start: '23:30', duration_minutes: 30 }).ok
		).toBe(true);
	});
});

describe('parseUpdateTask', () => {
	test('only the given fields end up in the patch', () => {
		expect(parseUpdateTask({ id: 4, start: '09:15', status: 'completed' })).toEqual({
			ok: true,
			value: { id: 4, patch: { startTime: 555, status: 'completed' } }
		});
	});

	test('needs an id and at least one change', () => {
		expect(parseUpdateTask({ start: '09:15' }).ok).toBe(false);
		expect(parseUpdateTask({ id: 4 }).ok).toBe(false);
		expect(parseUpdateTask({ id: 4, status: 'active' }).ok).toBe(false);
	});
});

describe('parseListTasks and parseDeleteTask', () => {
	test('range defaults to one day and is capped', () => {
		expect(parseListTasks({ from: '2026-10-14' })).toEqual({
			ok: true,
			value: { from: '2026-10-14', to: '2026-10-14' }
		});
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-27' }).ok).toBe(true);
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-28' }).ok).toBe(false);
		expect(parseListTasks({ from: '2026-10-14', to: '2026-10-13' }).ok).toBe(false);
	});

	test('delete needs an integer id', () => {
		expect(parseDeleteTask({ id: 3 }).ok).toBe(true);
		expect(parseDeleteTask({ id: '3' }).ok).toBe(false);
	});
});
