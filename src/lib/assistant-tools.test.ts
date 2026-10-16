/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	ACT_ONLY_TOOLS,
	MAX_LIST_DAYS,
	MAX_SAY,
	PREP_STEP_LIMITS,
	PREP_TOOLS,
	ROUTINE_WRITE_TOOLS,
	TOOLS,
	parseAddPrepSteps,
	parseAddRoutine,
	parseAddTask,
	parseAddTodo,
	parseAsk,
	parseDeleteById,
	parseDeleteTask,
	parseListTasks,
	parsePrepSteps,
	parseReason,
	parseSay,
	parseToolArguments,
	parseUpdateRoutine,
	parseUpdateTask,
	parseUpdateTodo,
	reactionTools
} from '#lib/assistant-tools.js';
import { addDays, isDateKey } from '#lib/time.js';

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
		for (const tool of [...TOOLS, ...PREP_TOOLS]) {
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

	test.each([
		['a title that is empty', { title: '  ' }],
		['a description that is not text', { description: 5 }],
		['a date that is not a date', { date: '14.10.2026' }],
		['a start that is not a time', { start: '25:00' }],
		['a duration under five minutes', { duration_minutes: 4 }],
		['a fractional duration', { duration_minutes: 7.5 }],
		['a priority above five', { priority: 6 }],
		['a priority that is text', { priority: '3' }]
	])('rejects %s', (_name, change) => {
		expect(parseUpdateTask({ id: 4, ...change }).ok).toBe(false);
	});

	test('a non integer id is rejected', () => {
		expect(parseUpdateTask({ id: 1.5, start: '09:00' }).ok).toBe(false);
		expect(parseUpdateTask({ id: '4', start: '09:00' }).ok).toBe(false);
	});

	test('a long description is cut to 1000 characters', () => {
		const result = parseUpdateTask({ id: 4, description: 'x'.repeat(1500) });
		expect(result.ok && result.value.patch.description?.length).toBe(1000);
	});
});

describe('the kind of a task', () => {
	const base = { title: 'Exam', date: '2026-10-14', start: '12:00' };

	test('kind, shift and the appointment of a travel task are read when sent', () => {
		const added = parseAddTask({ ...base, kind: 'travel', shift: 30, parent_id: 7 });
		expect(added.ok && added.value).toMatchObject({ kind: 'travel', shift: 30, parentId: 7 });
		const updated = parseUpdateTask({ id: 4, shift: 60 });
		expect(updated.ok && updated.value.patch).toEqual({ shift: 60 });
	});

	test('a task that says nothing about them has none of the three', () => {
		const added = parseAddTask(base);
		expect(added.ok && Object.keys(added.value)).not.toContain('kind');
		expect(added.ok && Object.keys(added.value)).not.toContain('shift');
	});

	test.each([
		['a kind that does not exist', { kind: 'meeting' }],
		['a shift beyond the most it may move', { shift: 241 }],
		['a shift that is not whole', { shift: 7.5 }],
		['a negative shift', { shift: -5 }],
		['an appointment id that is not a number', { parent_id: 'seven' }]
	])('rejects %s', (_name, change) => {
		expect(parseAddTask({ ...base, ...change }).ok).toBe(false);
		expect(parseUpdateTask({ id: 4, ...change }).ok).toBe(false);
	});
});

describe('to-do and routine tools', () => {
	test('a to-do is sent in the names of the screens, the clock as minutes', () => {
		expect(
			parseAddTodo({
				title: 'Study B',
				estimate_minutes: 180,
				due_date: '2026-11-05',
				due_time: '18:30',
				next_step: 'Open the book',
				parent_id: 12
			})
		).toEqual({
			ok: true,
			value: {
				title: 'Study B',
				estimate: 180,
				dueDate: '2026-11-05',
				dueTime: 18 * 60 + 30,
				nextStep: 'Open the book',
				parentId: 12
			}
		});
	});

	test('the progress cannot be sent', () => {
		const parsed = parseUpdateTodo({ id: 3, progress: 100, title: 'X' });
		expect(parsed).toEqual({ ok: true, value: { id: 3, title: 'X' } });
	});

	test('clear empties fields, a due date takes its time with it', () => {
		expect(parseUpdateTodo({ id: 3, clear: ['due', 'next_step'] })).toEqual({
			ok: true,
			value: { id: 3, dueDate: null, dueTime: null, nextStep: null }
		});
		expect(parseUpdateRoutine({ id: 2, clear: ['last_day'] })).toEqual({
			ok: true,
			value: { id: 2, lastDay: null }
		});
	});

	test.each([
		['a clock that is not a clock', () => parseAddTodo({ title: 'X', due_time: '25:00' })],
		['a field that cannot be cleared', () => parseUpdateTodo({ id: 3, clear: ['title'] })],
		['clear that is not a list', () => parseUpdateTodo({ id: 3, clear: 'due' })],
		['an update without an id', () => parseUpdateTodo({ title: 'X' })],
		['a routine update with a text id', () => parseUpdateRoutine({ id: '2', title: 'X' })],
		['a routine start that is not a clock', () => parseAddRoutine({ start: 'noon' })],
		['a delete of a to-do without an id', () => parseDeleteById({}, 'todo')]
	])('rejects %s', (_name, run) => {
		expect(run().ok).toBe(false);
	});

	test('a routine is sent in the names of the screens', () => {
		expect(
			parseAddRoutine({
				title: 'Meds',
				start: '07:00',
				duration_minutes: 15,
				repeat: 'daily',
				first_day: '2026-10-14',
				shift: 0
			})
		).toEqual({
			ok: true,
			value: {
				title: 'Meds',
				startTime: 420,
				duration: 15,
				repeat: 'daily',
				firstDay: '2026-10-14',
				shift: 0
			}
		});
	});

	test('the delete message names the list to look in', () => {
		const parsed = parseDeleteById({ id: 'x' }, 'routine');
		expect(!parsed.ok && parsed.error).toContain('list_routines');
	});

	test('an unprompted reaction may add or change to-dos with autonomy act, never a routine', () => {
		const names = (mayEdit: boolean) => reactionTools(mayEdit).map((tool) => tool.name);
		expect(names(false)).not.toContain('add_todo');
		expect(names(true)).toContain('add_todo');
		for (const tool of ROUTINE_WRITE_TOOLS) {
			expect(names(true)).not.toContain(tool);
			expect(names(false)).not.toContain(tool);
			expect(ACT_ONLY_TOOLS).not.toContain(tool);
			expect(TOOLS.map((chat) => chat.name)).toContain(tool);
		}
	});

	test('the floor of the day is in the routine tool descriptions', () => {
		const update = TOOLS.find((tool) => tool.name === 'update_routine')!;
		expect(update.description).toContain('Meds, meals, sleep and water');
	});
});

describe('steps that prepare for an appointment', () => {
	test('titles are trimmed and minutes may be left out or null', () => {
		expect(
			parsePrepSteps([
				{ title: ' Pack ID ', minutes: 10 },
				{ title: 'Charge it' },
				{ title: 'x', minutes: null }
			])
		).toEqual({
			ok: true,
			value: [
				{ title: 'Pack ID', minutes: 10 },
				{ title: 'Charge it', minutes: null },
				{ title: 'x', minutes: null }
			]
		});
	});

	test.each([
		['no list', undefined],
		['an empty list', []],
		[
			'a list that is too long',
			Array.from({ length: PREP_STEP_LIMITS.maxSteps + 1 }, () => ({ title: 'x' }))
		],
		['a step that is not an object', ['Pack']],
		['a step without a title', [{ minutes: 5 }]],
		['a title of 201 characters', [{ title: 'x'.repeat(201) }]],
		['minutes under the least', [{ title: 'x', minutes: PREP_STEP_LIMITS.minMinutes - 1 }]],
		['minutes over the most', [{ title: 'x', minutes: PREP_STEP_LIMITS.maxMinutes + 1 }]],
		['minutes that are text', [{ title: 'x', minutes: '10' }]]
	])('rejects %s', (_name, steps) => {
		expect(parsePrepSteps(steps).ok).toBe(false);
	});

	test('add_prep_steps needs an appointment id and the steps', () => {
		expect(
			parseAddPrepSteps({ appointment_id: 12, steps: [{ title: 'Pack', minutes: 5 }] })
		).toEqual({
			ok: true,
			value: { appointmentId: 12, steps: [{ title: 'Pack', minutes: 5 }] }
		});
		expect(parseAddPrepSteps({ steps: [{ title: 'Pack' }] }).ok).toBe(false);
		expect(parseAddPrepSteps({ appointment_id: '12', steps: [{ title: 'Pack' }] }).ok).toBe(false);
		expect(parseAddPrepSteps({ appointment_id: 12, steps: [] }).ok).toBe(false);
	});

	test('the suggestion tool is not one the chat or a reaction is given', () => {
		expect(TOOLS.map((tool) => tool.name)).not.toContain('suggest_steps');
		expect(reactionTools(true).map((tool) => tool.name)).not.toContain('suggest_steps');
		expect(PREP_TOOLS.map((tool) => tool.name)).toEqual(['suggest_steps']);
	});

	test('adding steps is a to-do tool: a reaction needs autonomy act, the chat may', () => {
		expect(reactionTools(false).map((tool) => tool.name)).not.toContain('add_prep_steps');
		expect(reactionTools(true).map((tool) => tool.name)).toContain('add_prep_steps');
		expect(TOOLS.map((tool) => tool.name)).toContain('add_prep_steps');
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

describe('properties', () => {
	const date = fc
		.date({
			min: new Date('2024-01-01T00:00:00Z'),
			max: new Date('2030-12-31T00:00:00Z'),
			noInvalidDate: true
		})
		.map((day) => day.toISOString().slice(0, 10));
	// Mostly plausible values, mixed with arbitrary JSON, so both the accepted and the rejected paths run
	const field = (plausible: fc.Arbitrary<unknown>) =>
		fc.oneof({ weight: 9, arbitrary: plausible }, { weight: 1, arbitrary: fc.jsonValue() });
	const clock = fc
		.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
		.map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
	const args = fc.record(
		{
			id: field(fc.integer({ min: 1, max: 50 })),
			title: field(fc.string({ maxLength: 220 })),
			description: field(fc.string({ maxLength: 1200 })),
			date: field(date),
			start: field(fc.oneof(clock, fc.integer({ min: -10, max: 1500 }))),
			duration_minutes: field(fc.integer({ min: -10, max: 1600 })),
			priority: field(fc.integer({ min: -1, max: 7 })),
			status: field(fc.constantFrom('pending', 'completed', 'active')),
			from: field(date),
			to: field(date)
		},
		{ requiredKeys: ['id', 'title', 'date', 'start'] }
	);
	// What the server sees: the model's JSON text, nulls and all
	const sent = args.map((value) => parseToolArguments(JSON.stringify(value))!);

	test('no parser throws, whatever the model sends', () => {
		fc.assert(
			fc.property(sent, (value) => {
				for (const parse of [
					parseAddTask,
					parseUpdateTask,
					parseDeleteTask,
					parseListTasks,
					parseSay,
					parseAsk
				])
					expect(() => parse(value)).not.toThrow();
			})
		);
		fc.assert(
			fc.property(fc.string(), (raw) => {
				expect(() => parseToolArguments(raw)).not.toThrow();
			})
		);
	});

	test('an accepted new task is whole: titled, on one day and never across midnight', () => {
		fc.assert(
			fc.property(sent, (value) => {
				const parsed = parseAddTask(value);
				if (!parsed.ok) return;
				const task = parsed.value;
				expect(task.title).toBe(task.title.trim());
				expect(task.title.length).toBeGreaterThan(0);
				expect(task.title.length).toBeLessThanOrEqual(200);
				expect(isDateKey(task.date)).toBe(true);
				expect(task.startTime).toBeGreaterThanOrEqual(0);
				expect(task.startTime + task.duration).toBeLessThanOrEqual(1440);
				expect(task.duration).toBeGreaterThanOrEqual(5);
				expect(task.priority).toBeGreaterThanOrEqual(1);
				expect(task.priority).toBeLessThanOrEqual(5);
			})
		);
	});

	test('an accepted patch holds only valid fields', () => {
		fc.assert(
			fc.property(sent, (value) => {
				const parsed = parseUpdateTask(value);
				if (!parsed.ok) return;
				const { patch } = parsed.value;
				expect(Object.keys(patch).length).toBeGreaterThan(0);
				if (patch.startTime !== undefined) expect(patch.startTime).toBeLessThan(1440);
				if (patch.duration !== undefined) expect(patch.duration).toBeLessThanOrEqual(1440);
				if (patch.priority !== undefined) expect([1, 2, 3, 4, 5]).toContain(patch.priority);
				if (patch.status !== undefined) expect(['pending', 'completed']).toContain(patch.status);
			})
		);
	});

	test('an accepted range is ordered and at most the allowed days', () => {
		fc.assert(
			fc.property(sent, (value) => {
				const parsed = parseListTasks(value);
				if (!parsed.ok) return;
				const { from, to } = parsed.value;
				expect(to >= from).toBe(true);
				expect(addDays(from, MAX_LIST_DAYS - 1) >= to).toBe(true);
			})
		);
	});
});
