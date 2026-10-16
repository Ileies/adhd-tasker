/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { runAssistant, runTool, undoAction, type Change } from '#lib/core/assistant.js';
import {
	MAX_LISTED,
	dayLines,
	describeRoutine,
	describeTodo,
	routineLines,
	todoLines,
	undoListTool
} from '#lib/core/assistant-lists.js';
import { NOW, testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';
import { fakeModel, text, toolCalls } from '#test/fakes.js';

const DATE = '2026-10-14';

type Made = Awaited<ReturnType<typeof testCtx>>;

const run = async (made: Made, name: string, args: unknown, changes: Change[] = []) =>
	runTool(made.ctx, await made.repo.settings.get(), name, JSON.stringify(args), changes);

const addTodo = (
	made: Made,
	fields: Partial<Parameters<Made['repo']['todos']['insert']>[0]> = {}
) => made.repo.todos.insert({ title: 'Study B', priority: 3, createdAt: NOW, ...fields });

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
	errors = spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe('to-do tools', () => {
	test('add_todo makes the to-do with its size and due date, logs it and says so', async () => {
		const made = await testCtx();
		const changes: Change[] = [];
		const result = await run(
			made,
			'add_todo',
			{
				title: 'Study B',
				estimate_minutes: 180,
				due_date: '2026-11-05',
				due_time: '18:00',
				reason: 'asked for'
			},
			changes
		);
		const [todo] = await made.repo.todos.open();
		expect(todo).toMatchObject({ title: 'Study B', estimate: 180, dueDate: '2026-11-05' });
		expect(result).toEqual({ added: describeTodo(todo) });
		const [action] = await made.repo.actions.recent(1);
		expect(action).toMatchObject({ tool: 'add_todo', before: null, reason: 'asked for' });
		expect(changes).toEqual([{ id: action.id, summary: 'Added the to-do Study B', dates: [] }]);
		expect(made.hints).toContainEqual({ type: 'todos' });
	});

	test('the event it raises is the agent own, so it never wakes the agent', async () => {
		const made = await testCtx();
		await run(made, 'add_todo', { title: 'Study B' });
		expect(await made.repo.events.recent(1)).toMatchObject([
			{ type: 'todo.created', origin: 'agent', outcome: 'caused by the agent' }
		]);
		expect(made.state.reacts).toBe(0);
	});

	test('update_todo changes what was sent and never the progress', async () => {
		const made = await testCtx();
		const todo = await addTodo(made, { progress: 40, estimate: 60 });
		await run(made, 'update_todo', { id: todo.id, estimate_minutes: 120, progress: 100 });
		expect(await made.repo.todos.get(todo.id)).toMatchObject({ estimate: 120, progress: 40 });
	});

	test('update_todo can mark done and reopen, and clear a due date', async () => {
		const made = await testCtx();
		const todo = await addTodo(made, { dueDate: '2026-11-05', dueTime: 600 });
		await run(made, 'update_todo', { id: todo.id, clear: ['due'] });
		expect(await made.repo.todos.get(todo.id)).toMatchObject({ dueDate: null, dueTime: null });
		await run(made, 'update_todo', { id: todo.id, status: 'done' });
		expect(await made.repo.todos.get(todo.id)).toMatchObject({
			status: 'done',
			progress: 100,
			completedAt: NOW
		});
		await run(made, 'update_todo', { id: todo.id, status: 'open' });
		expect(await made.repo.todos.get(todo.id)).toMatchObject({ status: 'open', completedAt: null });
	});

	test('update_todo and delete_todo of a to-do that is not there say so and log nothing', async () => {
		const made = await testCtx();
		expect(await run(made, 'update_todo', { id: 99, title: 'X' })).toEqual({
			error: 'no such to-do'
		});
		expect(await run(made, 'delete_todo', { id: 99 })).toEqual({ error: 'To-do not found' });
		expect(await made.repo.actions.recent(5)).toEqual([]);
	});

	test('a rule of the screens is a rule of the tool: a to-do prepares for an appointment that exists', async () => {
		const made = await testCtx();
		const result = await run(made, 'add_todo', { title: 'Pack', parent_id: 404 });
		expect(result).toEqual({ error: 'The appointment this is for does not exist' });
		expect(await made.repo.todos.open()).toEqual([]);
		expect(await made.repo.actions.recent(5)).toEqual([]);
	});

	test('bad arguments are an error for the model, nothing is changed', async () => {
		const made = await testCtx();
		expect(await run(made, 'add_todo', { title: 'X', due_time: '25:00' })).toEqual({
			error: 'due_time must be HH:MM'
		});
		expect(await run(made, 'add_todo', { title: 'X', estimate_minutes: 0 })).toMatchObject({
			error: expect.stringContaining('estimate')
		});
		expect(await run(made, 'delete_todo', { id: 'x' })).toMatchObject({
			error: expect.any(String)
		});
		expect(await made.repo.todos.open()).toEqual([]);
	});

	test('list_todos describes the open ones only', async () => {
		const made = await testCtx();
		const open = await addTodo(made, { estimate: 90, dueDate: '2026-11-05', progress: 25 });
		await addTodo(made, { title: 'Old', status: 'done' });
		expect(await run(made, 'list_todos', {})).toEqual({ todos: [describeTodo(open)] });
		expect(describeTodo(open)).toBe(
			`#${open.id} P3 Study B (size 1 h 30 min, 25 % done, due 2026-11-05)`
		);
	});

	test('a to-do without a size says so, a prepared one names its appointment and next step', async () => {
		const made = await testCtx();
		const todo = await addTodo(made, {
			parentId: 12,
			nextStep: 'Open the book',
			dueTime: 600,
			dueDate: DATE
		});
		expect(describeTodo(todo)).toBe(
			`#${todo.id} P3 Study B (size unknown, 0 % done, due ${DATE} 10:00, prepares for #12, next step: Open the book)`
		);
	});
});

describe('add_prep_steps', () => {
	const exam = (made: Made) =>
		made.repo.tasks.insert({
			title: 'Exam Math',
			description: '',
			date: '2026-10-16',
			startTime: 12 * 60,
			duration: 120,
			priority: 4,
			kind: 'appointment'
		});
	const steps = [
		{ title: 'Pack ID and pens', minutes: 5 },
		{ title: 'Charge the calculator', minutes: null }
	];

	test('each step is a to-do of the appointment, due when it starts, one change each for Undo', async () => {
		const made = await testCtx();
		const appointment = await exam(made);
		const changes: Change[] = [];
		await run(made, 'add_prep_steps', { appointment_id: appointment.id, steps }, changes);
		const todos = await made.repo.todos.open();
		expect(todos.map((todo) => [todo.title, todo.estimate, todo.parentId, todo.priority])).toEqual([
			['Pack ID and pens', 5, appointment.id, 4],
			['Charge the calculator', null, appointment.id, 4]
		]);
		expect(todos.every((todo) => todo.dueDate === '2026-10-16' && todo.dueTime === 12 * 60)).toBe(
			true
		);
		expect(changes.map((change) => change.summary)).toEqual([
			'Added the to-do Pack ID and pens',
			'Added the to-do Charge the calculator'
		]);
		await undoAction(made.ctx, changes[1].id);
		expect((await made.repo.todos.open()).map((todo) => todo.title)).toEqual(['Pack ID and pens']);
	});

	test('with travel they are due when the travel starts', async () => {
		const made = await testCtx();
		const appointment = await exam(made);
		await made.repo.tasks.insert({
			title: 'Travel to Exam Math',
			description: '',
			date: '2026-10-16',
			startTime: 11 * 60 + 5,
			duration: 45,
			priority: 4,
			kind: 'travel',
			parentId: appointment.id
		});
		await run(made, 'add_prep_steps', { appointment_id: appointment.id, steps });
		const [first] = await made.repo.todos.open();
		expect(first).toMatchObject({ dueDate: '2026-10-16', dueTime: 11 * 60 + 5 });
	});

	test('the events are the agent own and never wake it', async () => {
		const made = await testCtx();
		const appointment = await exam(made);
		await run(made, 'add_prep_steps', { appointment_id: appointment.id, steps });
		expect(made.state.reacts).toBe(0);
		expect((await made.repo.events.recent(2)).map((row) => row.origin)).toEqual(['agent', 'agent']);
	});

	test('only for an appointment that exists, with valid steps, and nothing is written otherwise', async () => {
		const made = await testCtx();
		const block = await made.repo.tasks.insert({
			title: 'Read',
			description: '',
			date: '2026-10-16',
			startTime: 600,
			duration: 30,
			priority: 2
		});
		const appointment = await exam(made);
		const wrong = { error: 'appointment_id must be an appointment from list_tasks' };
		expect(await run(made, 'add_prep_steps', { appointment_id: block.id, steps })).toEqual(wrong);
		expect(await run(made, 'add_prep_steps', { appointment_id: 999, steps })).toEqual(wrong);
		expect(
			await run(made, 'add_prep_steps', { appointment_id: appointment.id, steps: [] })
		).toMatchObject({
			error: expect.stringContaining('steps')
		});
		expect(await made.repo.todos.open()).toEqual([]);
		expect(await made.repo.actions.recent(5)).toEqual([]);
	});
});

describe('routine tools', () => {
	const meds = {
		title: 'Meds',
		start: '07:00',
		duration_minutes: 15,
		repeat: 'daily',
		first_day: DATE
	};

	test('add_routine makes the routine and its fourteen days, and logs it', async () => {
		const made = await testCtx();
		const changes: Change[] = [];
		const result = await run(made, 'add_routine', meds, changes);
		const [routine] = await made.repo.routines.all();
		expect(result).toEqual({ added: describeRoutine(routine) });
		expect(await made.repo.tasks.between(DATE, '2026-12-31')).toHaveLength(14);
		expect(changes).toMatchObject([{ summary: 'Added the routine Meds', dates: [] }]);
		expect(made.hints).toContainEqual({ type: 'routines' });
		expect(describeRoutine(routine)).toBe(`#${routine.id} every day 07:00-07:15 P2 Meds`);
	});

	test('update_routine moves its days and says what it did', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', meds);
		const [routine] = await made.repo.routines.all();
		await run(made, 'update_routine', { id: routine.id, start: '08:00' });
		const days = await made.repo.tasks.between(DATE, '2026-12-31');
		expect(days.every((task) => task.startTime === 8 * 60)).toBe(true);
	});

	test('rules of the routines come back as errors, nothing is logged', async () => {
		const made = await testCtx();
		expect(await run(made, 'add_routine', { ...meds, last_day: '2026-10-01' })).toEqual({
			error: 'lastDay is before firstDay'
		});
		expect(await run(made, 'update_routine', { id: 5, title: 'X' })).toEqual({
			error: 'no such routine'
		});
		expect(await run(made, 'delete_routine', { id: 5 })).toEqual({ error: 'Routine not found' });
		expect(await made.repo.actions.recent(5)).toEqual([]);
	});

	test('delete_routine removes it with its days from today on', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', meds);
		const [routine] = await made.repo.routines.all();
		const result = await run(made, 'delete_routine', { id: routine.id });
		expect(result).toEqual({ deleted: describeRoutine(routine) });
		expect(await made.repo.routines.all()).toEqual([]);
		expect(await made.repo.tasks.between(DATE, '2026-12-31')).toEqual([]);
	});

	test('list_routines describes them, a meal tells how far it may move and when it ends', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', {
			title: 'Lunch',
			start: '12:00',
			duration_minutes: 45,
			repeat: 'weekdays',
			shift: 60,
			last_day: '2026-12-31',
			first_day: DATE
		});
		const [lunch] = await made.repo.routines.all();
		expect(await run(made, 'list_routines', {})).toEqual({ routines: [describeRoutine(lunch)] });
		expect(describeRoutine(lunch)).toContain('may move 60 min');
		expect(describeRoutine(lunch)).toContain('until 2026-12-31');
	});
});

describe('Undo of to-do and routine tools', () => {
	const change = async (made: Made, name: string, args: unknown) => {
		const changes: Change[] = [];
		await run(made, name, args, changes);
		return changes[0].id;
	};

	test('an added to-do is removed again, with its own event', async () => {
		const made = await testCtx();
		const id = await change(made, 'add_todo', { title: 'Study B' });
		expect(await undoAction(made.ctx, id)).toEqual({ dates: [] });
		expect(await made.repo.todos.open()).toEqual([]);
		expect(await made.repo.events.recent(1)).toMatchObject([
			{ type: 'todo.deleted', origin: 'user', payload: { undoOfAgentChange: true } }
		]);
		expect((await made.repo.actions.get(id))?.undoneAt).toBe(NOW);
	});

	test('a changed to-do gets its old values back, progress included', async () => {
		const made = await testCtx();
		const todo = await addTodo(made, { estimate: 60, progress: 30 });
		const id = await change(made, 'update_todo', { id: todo.id, status: 'done' });
		await undoAction(made.ctx, id);
		expect(await made.repo.todos.get(todo.id)).toEqual(todo);
	});

	test('a deleted to-do comes back under its id', async () => {
		const made = await testCtx();
		const todo = await addTodo(made, { estimate: 60 });
		const id = await change(made, 'delete_todo', { id: todo.id });
		expect(await made.repo.todos.get(todo.id)).toBeNull();
		await undoAction(made.ctx, id);
		expect(await made.repo.todos.get(todo.id)).toEqual(todo);
	});

	test('an added routine goes with its days', async () => {
		const made = await testCtx();
		const id = await change(made, 'add_routine', {
			title: 'Meds',
			start: '07:00',
			duration_minutes: 15,
			repeat: 'daily',
			first_day: DATE
		});
		await undoAction(made.ctx, id);
		expect(await made.repo.routines.all()).toEqual([]);
		expect(await made.repo.tasks.between(DATE, '2026-12-31')).toEqual([]);
	});

	test('a changed routine is changed back, its days follow', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', {
			title: 'Meds',
			start: '07:00',
			duration_minutes: 15,
			repeat: 'daily',
			first_day: DATE
		});
		const [routine] = await made.repo.routines.all();
		const id = await change(made, 'update_routine', { id: routine.id, start: '09:00' });
		await undoAction(made.ctx, id);
		const days = await made.repo.tasks.between(DATE, '2026-12-31');
		expect(days).toHaveLength(14);
		expect(days.every((task) => task.startTime === 7 * 60)).toBe(true);
		expect((await made.repo.routines.get(routine.id))?.startTime).toBe(7 * 60);
	});

	test('a deleted routine is made again with its days', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', {
			title: 'Meds',
			start: '07:00',
			duration_minutes: 15,
			repeat: 'daily',
			first_day: DATE
		});
		const [routine] = await made.repo.routines.all();
		const id = await change(made, 'delete_routine', { id: routine.id });
		await undoAction(made.ctx, id);
		const [again] = await made.repo.routines.all();
		expect(again).toMatchObject({ title: 'Meds', repeat: 'daily', startTime: 420 });
		expect(await made.repo.tasks.between(DATE, '2026-12-31')).toHaveLength(14);
	});

	test('undoing a change to something that is gone meanwhile leaves nothing to put back', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', {
			title: 'Meds',
			start: '07:00',
			duration_minutes: 15,
			repeat: 'daily',
			first_day: DATE
		});
		const [routine] = await made.repo.routines.all();
		const changed = await change(made, 'update_routine', { id: routine.id, start: '09:00' });
		const added = (await made.repo.actions.recent(5)).at(-1)!;
		await made.repo.routines.delete(routine.id);
		await undoAction(made.ctx, changed);
		await undoAction(made.ctx, added.id);
		expect(await made.repo.routines.all()).toEqual([]);
	});

	test('a failure that is not a rule is not hidden', async () => {
		const made = await testCtx();
		const routine = await made.repo.routines.insert({
			title: 'Meds',
			priority: 2,
			startTime: 420,
			duration: 15,
			repeat: 'daily',
			firstDay: DATE
		});
		const restore = spyOn(made.repo.routines, 'get').mockRejectedValue(new Error('disk'));
		await expect(undoListTool(made.ctx, 'update_routine', routine, routine)).rejects.toThrow(
			'disk'
		);
		restore.mockRestore();
	});

	test('a task tool is not one of these', async () => {
		const made = await testCtx();
		expect(await undoListTool(made.ctx, 'add_task', null, null)).toBe(false);
	});

	test('an unknown action id is still not found', async () => {
		const made = await testCtx();
		expect(await failureOf(undoAction(made.ctx, 99))).toMatchObject({ status: 404 });
	});
});

describe('what the model is told', () => {
	test('the lists are capped and say where the rest is', async () => {
		const made = await testCtx();
		for (let n = 0; n < MAX_LISTED + 2; n++) await addTodo(made, { title: `To-do ${n}` });
		const lines = await todoLines(made.ctx);
		expect(lines).toHaveLength(MAX_LISTED + 1);
		expect(lines.at(-1)).toBe('and 2 more, use list_todos');
		expect(await routineLines(made.ctx)).toEqual([]);
	});

	test('the chat prompt carries the to-dos, the routines and the floor of the day', async () => {
		const { model, calls } = fakeModel(text('ok'));
		const made = await testCtx({ model });
		await addTodo(made, { title: 'Study B', estimate: 180 });
		await run(made, 'add_routine', {
			title: 'Meds',
			start: '07:00',
			duration_minutes: 15,
			repeat: 'daily',
			first_day: DATE
		});
		await runAssistant(made.ctx, await made.repo.settings.get(), [{ role: 'user', content: 'hi' }]);
		const prompt = calls[0].instructions;
		expect(prompt).toContain('Study B (size 3 h');
		expect(prompt).toContain('every day 07:00-07:15');
		expect(prompt).toContain('Meds, meals, sleep and water are the floor of the day');
		expect(prompt).toContain('cannot set the progress');
		expect(prompt).toContain('Right now: ');
		expect(prompt).toContain('Today so far: nothing answered yet');
	});

	test('the day lines follow the flow engine: a session on a to-do after Start', async () => {
		const made = await testCtx({ now: Date.parse('2026-10-14T10:00:00Z') });
		await addTodo(made, { title: 'Study B', estimate: 120 });
		await made.repo.flow.insert({
			at: Date.parse('2026-10-14T09:55:00Z'),
			date: DATE,
			type: 'start'
		});
		const [now, log] = await dayLines(made.ctx, await made.repo.settings.get());
		expect(now).toContain('a session on the to-do "Study B"');
		expect(log).toBe('Today so far: nothing answered yet');
	});

	test('a task a routine made is marked as one, one that may move says how far', async () => {
		const made = await testCtx();
		await run(made, 'add_routine', {
			title: 'Lunch',
			start: '12:00',
			duration_minutes: 45,
			repeat: 'daily',
			shift: 60,
			first_day: DATE
		});
		const listed = (await run(made, 'list_tasks', { from: DATE })) as { tasks: string[] };
		expect(listed.tasks[0]).toContain('[may move 60 min, routine #');
	});

	test('the chat can add a todo through a model round', async () => {
		const first = toolCalls([
			{ name: 'add_todo', id: 'c1', arguments: { title: 'Laundry', estimate_minutes: 45 } }
		]);
		const { model } = fakeModel(first, text('Added.'));
		const made = await testCtx({ model });
		const answer = await runAssistant(made.ctx, await made.repo.settings.get(), [
			{ role: 'user', content: 'add laundry' }
		]);
		expect(answer.changes).toMatchObject([{ summary: 'Added the to-do Laundry' }]);
		expect((await made.repo.todos.open())[0]).toMatchObject({ title: 'Laundry', estimate: 45 });
	});
});
