/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { createTodo, deleteTodo, loadTodos, RECENT_DONE_MS, updateTodo } from '#lib/core/todos.js';
import { Priority } from '#lib/types.js';
import { NOW, testCtx } from '#test/ctx.js';

/** What a call that is refused throws (`null` when it did not). */
const refusal = (call: Promise<unknown>) =>
	call.then(
		() => null,
		(error: unknown) => error
	);

const events = async (repo: Awaited<ReturnType<typeof testCtx>>['repo']) =>
	(await repo.events.recent(10)).map((row) => row.type);

describe('createTodo', () => {
	test('a title is enough: it is open at 0 % and stamped with the clock', async () => {
		const { ctx } = await testCtx();
		const todo = await createTodo(ctx, { title: 'Study Math' });
		expect(todo).toMatchObject({
			title: 'Study Math',
			status: 'open',
			progress: 0,
			priority: Priority.Medium,
			createdAt: NOW
		});
	});

	test('logs todo.created and tells the open screens', async () => {
		const { ctx, repo, hints } = await testCtx();
		await createTodo(ctx, { title: 'Taxes', dueDate: '2026-11-05' });
		expect(await events(repo)).toEqual(['todo.created']);
		expect(hints).toEqual([{ type: 'todos' }]);
	});

	test('refuses what the validator refuses, with status 400', async () => {
		const { ctx } = await testCtx();
		expect(await refusal(createTodo(ctx, { title: '' }))).toMatchObject({ status: 400 });
	});

	test('an appointment that does not exist is refused', async () => {
		const { ctx } = await testCtx();
		expect(await refusal(createTodo(ctx, { title: 'x', parentId: 99 }))).toMatchObject({
			status: 400
		});
	});

	test('a to-do for an existing appointment is accepted', async () => {
		const { ctx, repo } = await testCtx();
		const exam = await repo.tasks.insert({
			title: 'Exam',
			description: '',
			date: '2026-11-05',
			startTime: 720,
			duration: 120,
			priority: Priority.High
		});
		expect((await createTodo(ctx, { title: 'Prepare', parentId: exam.id })).parentId).toBe(exam.id);
	});

	test('created as done it is stamped and complete', async () => {
		const { ctx } = await testCtx();
		expect(await createTodo(ctx, { title: 'x', status: 'done' })).toMatchObject({
			status: 'done',
			progress: 100,
			completedAt: NOW
		});
	});
});

describe('updateTodo', () => {
	test('changes the given fields and answers the to-do', async () => {
		const { ctx } = await testCtx();
		const todo = await createTodo(ctx, { title: 'x' });
		expect(await updateTodo(ctx, { id: todo.id, progress: 40, estimate: 120 })).toMatchObject({
			progress: 40,
			estimate: 120
		});
	});

	test('done stamps the time and fills the bar, reopening clears the stamp', async () => {
		const { ctx, state } = await testCtx();
		const todo = await createTodo(ctx, { title: 'x' });
		state.now = NOW + 5000;
		expect(await updateTodo(ctx, { id: todo.id, status: 'done' })).toMatchObject({
			completedAt: NOW + 5000,
			progress: 100
		});
		expect(await updateTodo(ctx, { id: todo.id, status: 'open' })).toMatchObject({
			status: 'open',
			completedAt: null
		});
	});

	test('logs todo.completed for done and todo.updated for an edit, nothing for progress', async () => {
		const { ctx, repo } = await testCtx();
		const todo = await createTodo(ctx, { title: 'x' });
		await updateTodo(ctx, { id: todo.id, progress: 10 });
		await updateTodo(ctx, { id: todo.id, title: 'y' });
		await updateTodo(ctx, { id: todo.id, status: 'done' });
		expect((await events(repo)).reverse()).toEqual([
			'todo.created',
			'todo.updated',
			'todo.completed'
		]);
	});

	test.each([
		[{}, 400],
		[{ id: 'x', title: 'y' }, 400],
		[{ id: 999, title: 'y' }, 404]
	])('%j fails with %i', async (body, status) => {
		const { ctx } = await testCtx();
		expect(await refusal(updateTodo(ctx, body))).toMatchObject({ status });
	});

	test('a due time needs a due date, the saved one counts', async () => {
		const { ctx } = await testCtx();
		const plain = await createTodo(ctx, { title: 'a' });
		expect(await refusal(updateTodo(ctx, { id: plain.id, dueTime: 600 }))).toMatchObject({
			status: 400
		});
		const dated = await createTodo(ctx, { title: 'b', dueDate: '2026-11-05' });
		expect((await updateTodo(ctx, { id: dated.id, dueTime: 600 })).dueTime).toBe(600);
	});
});

describe('deleteTodo', () => {
	test('removes the to-do and logs todo.deleted', async () => {
		const { ctx, repo } = await testCtx();
		const todo = await createTodo(ctx, { title: 'x' });
		await deleteTodo(ctx, { id: todo.id });
		expect(await repo.todos.get(todo.id)).toBeNull();
		expect((await events(repo))[0]).toBe('todo.deleted');
	});

	test('a missing to-do is a 404 and a bad id a 400', async () => {
		const { ctx } = await testCtx();
		expect(await refusal(deleteTodo(ctx, { id: 5 }))).toMatchObject({ status: 404 });
		expect(await refusal(deleteTodo(ctx, {}))).toMatchObject({ status: 400 });
	});
});

describe('loadTodos', () => {
	test('lists the open to-dos and the ones finished recently, not older ones', async () => {
		const { ctx, repo } = await testCtx();
		await repo.todos.insert({ title: 'open', priority: 2, createdAt: 1 });
		const fresh = await repo.todos.insert({ title: 'fresh', priority: 2, createdAt: 1 });
		const old = await repo.todos.insert({ title: 'old', priority: 2, createdAt: 1 });
		await repo.todos.update(fresh.id, { status: 'done', completedAt: NOW - 1000 });
		await repo.todos.update(old.id, { status: 'done', completedAt: NOW - RECENT_DONE_MS - 1 });
		expect((await loadTodos(ctx)).map((todo) => todo.title)).toEqual(['open', 'fresh']);
	});
});
