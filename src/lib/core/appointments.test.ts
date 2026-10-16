/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { endPreparation } from '#lib/core/appointments.js';
import { AssistantError } from '#lib/core/context.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import type { Repo, Todo } from '#lib/core/repo.js';
import { testCtx } from '#test/ctx.js';

const exam = {
	title: 'Exam Math',
	description: '',
	date: '2026-11-05',
	startTime: 12 * 60,
	duration: 120,
	priority: 3,
	kind: 'appointment'
};
const travelOf = (parentId: number) => ({
	title: 'Travel to Exam Math',
	description: '',
	date: '2026-11-05',
	startTime: 11 * 60 + 5,
	duration: 45,
	priority: 3,
	kind: 'travel',
	parentId
});

const failure = async (work: Promise<unknown>) => {
	try {
		await work;
	} catch (thrown) {
		return thrown as AssistantError;
	}
	throw new Error('expected a failure');
};

/** An exam with travel and one to-do preparing for it, due when the travel starts. */
async function examWithPrep() {
	const world = await testCtx();
	const appointment = await createPlanTask(world.ctx, exam);
	const travel = await createPlanTask(world.ctx, travelOf(appointment.id));
	const prep = await world.repo.todos.insert({
		title: 'Study Math',
		priority: 3,
		parentId: appointment.id,
		dueDate: '2026-11-05',
		dueTime: 11 * 60 + 5,
		progress: 85
	});
	return { ...world, appointment, travel, prep };
}

const todoOf = async (repo: Repo, id: number): Promise<Todo> => (await repo.todos.get(id))!;

describe('what a task may lead to', () => {
	test('travel to an appointment on its day is stored with its kind and parent', async () => {
		const { ctx, repo } = await testCtx();
		const appointment = await createPlanTask(ctx, exam);
		const travel = await createPlanTask(ctx, travelOf(appointment.id));
		expect(await repo.tasks.get(travel.id)).toMatchObject({
			kind: 'travel',
			parentId: appointment.id
		});
	});

	test.each([
		['travel without an appointment', (id: number) => ({ ...travelOf(id), parentId: undefined })],
		['travel to an appointment that is not there', () => ({ ...travelOf(999) })],
		[
			'travel on another day than its appointment',
			(id: number) => ({ ...travelOf(id), date: '2026-11-04' })
		],
		[
			'a task with a parent that is not travel',
			(id: number) => ({ ...exam, kind: 'block', parentId: id })
		]
	])('refuses %s', async (_name, body) => {
		const { ctx } = await testCtx();
		const appointment = await createPlanTask(ctx, exam);
		const error = await failure(createPlanTask(ctx, body(appointment.id)));
		expect(error.status).toBe(400);
	});

	test('travel to something that is no appointment is refused', async () => {
		const { ctx } = await testCtx();
		const mine = await createPlanTask(ctx, { ...exam, kind: 'block' });
		expect((await failure(createPlanTask(ctx, travelOf(mine.id)))).status).toBe(400);
	});

	test('an appointment has one travel only', async () => {
		const { ctx } = await testCtx();
		const appointment = await createPlanTask(ctx, exam);
		await createPlanTask(ctx, travelOf(appointment.id));
		const error = await failure(createPlanTask(ctx, travelOf(appointment.id)));
		expect(error.message).toBe('That appointment has its travel already');
	});

	test('travel cannot be dragged to another day than its appointment', async () => {
		const { ctx, travel } = await examWithPrep();
		const error = await failure(updatePlanTask(ctx, { id: travel.id, date: '2026-11-04' }));
		expect(error.status).toBe(400);
	});

	test('a task turned from travel into a block lets go of its appointment', async () => {
		const { ctx, repo, travel } = await examWithPrep();
		await updatePlanTask(ctx, { id: travel.id, kind: 'block' });
		expect(await repo.tasks.get(travel.id)).toMatchObject({ kind: 'block', parentId: null });
	});
});

describe('an appointment moves', () => {
	test('travel keeps its gap and its length when the appointment moves later in the day', async () => {
		const { ctx, repo, appointment, travel } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, startTime: 14 * 60 });
		expect(await repo.tasks.get(travel.id)).toMatchObject({
			date: '2026-11-05',
			startTime: 13 * 60 + 5,
			duration: 45
		});
	});

	test('travel and the preparation follow the appointment to the next day', async () => {
		const { ctx, repo, appointment, travel, prep } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, date: '2026-11-06' });
		expect(await repo.tasks.get(travel.id)).toMatchObject({
			date: '2026-11-06',
			startTime: 11 * 60 + 5
		});
		expect(await todoOf(repo, prep.id)).toMatchObject({
			dueDate: '2026-11-06',
			dueTime: 11 * 60 + 5
		});
	});

	test('the preparation moves by the minutes the appointment moved', async () => {
		const { ctx, repo, appointment, prep } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, startTime: 14 * 60 });
		expect(await todoOf(repo, prep.id)).toMatchObject({
			dueDate: '2026-11-05',
			dueTime: 13 * 60 + 5
		});
	});

	test('a change that does not move it leaves travel and preparation alone', async () => {
		const { ctx, repo, appointment, travel, prep } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, title: 'Exam Math, room 4' });
		expect(await repo.tasks.get(travel.id)).toEqual(travel);
		expect(await todoOf(repo, prep.id)).toEqual(prep);
	});

	test('travel is logged as a change of the plan, by the user', async () => {
		const { ctx, repo, appointment } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, startTime: 14 * 60 });
		const events = await repo.events.recent(10);
		expect(events.filter((event) => event.type === 'task.updated').map((e) => e.origin)).toEqual([
			'user',
			'user'
		]);
	});

	test('travel that would run into the day before is cut short, and gone when nothing is left', async () => {
		const { ctx, repo, appointment, travel } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, startTime: 40 });
		expect(await repo.tasks.get(travel.id)).toMatchObject({ startTime: 0, duration: 30 });
		await updatePlanTask(ctx, { id: appointment.id, startTime: 12 });
		expect(await repo.tasks.get(travel.id)).toBeNull();
	});

	test('a preparation that ended with the appointment is open again when it moves to the future', async () => {
		const { ctx, repo, appointment, prep } = await examWithPrep();
		await repo.todos.update(prep.id, { status: 'ended' });
		await updatePlanTask(ctx, { id: appointment.id, date: '2026-11-06' });
		expect((await todoOf(repo, prep.id)).status).toBe('open');
	});

	test('one that ended stays ended when the appointment moves within the past', async () => {
		const { ctx, repo, appointment, prep, state } = await examWithPrep();
		state.now = Date.parse('2026-11-05T20:00:00Z');
		await repo.todos.update(prep.id, { status: 'ended' });
		await updatePlanTask(ctx, { id: appointment.id, startTime: 8 * 60 });
		expect((await todoOf(repo, prep.id)).status).toBe('ended');
	});

	test('turning the appointment into a task of the user releases its travel, nothing is deleted', async () => {
		const { ctx, repo, appointment, travel } = await examWithPrep();
		await updatePlanTask(ctx, { id: appointment.id, kind: 'block' });
		expect(await repo.tasks.get(travel.id)).toMatchObject({ kind: 'block', parentId: null });
	});

	test('a plain task moving moves nothing along', async () => {
		const { ctx, repo, travel } = await examWithPrep();
		const mine = await createPlanTask(ctx, { ...exam, kind: 'block', title: 'Mine' });
		await updatePlanTask(ctx, { id: mine.id, startTime: 600 });
		expect(await repo.tasks.get(travel.id)).toEqual(travel);
	});
});

describe('an appointment is deleted', () => {
	test('its travel goes with it', async () => {
		const { ctx, repo, appointment, travel } = await examWithPrep();
		await deletePlanTask(ctx, { id: appointment.id });
		expect(await repo.tasks.get(travel.id)).toBeNull();
	});

	test('the preparation stays due when it was and says what it was for', async () => {
		const { ctx, repo, appointment, prep } = await examWithPrep();
		await deletePlanTask(ctx, { id: appointment.id });
		expect(await todoOf(repo, prep.id)).toMatchObject({
			parentId: null,
			dueDate: '2026-11-05',
			dueTime: 11 * 60 + 5,
			description: 'Exam Math was removed.'
		});
	});

	test('the line comes before what the user wrote and is not added twice', async () => {
		const { ctx, repo, appointment, prep } = await examWithPrep();
		await repo.todos.update(prep.id, { description: 'chapters 1 to 4' });
		await deletePlanTask(ctx, { id: appointment.id });
		expect((await todoOf(repo, prep.id)).description).toBe(
			'Exam Math was removed.\nchapters 1 to 4'
		);
	});

	test('deleting the travel alone leaves the appointment and the preparation', async () => {
		const { ctx, repo, appointment, travel, prep } = await examWithPrep();
		await deletePlanTask(ctx, { id: travel.id });
		expect(await repo.tasks.get(appointment.id)).not.toBeNull();
		expect(await todoOf(repo, prep.id)).toEqual(prep);
	});

	test('a task of the user that is deleted removes nothing else', async () => {
		const { ctx, repo, travel } = await examWithPrep();
		const mine = await createPlanTask(ctx, { ...exam, kind: 'block', title: 'Mine' });
		await deletePlanTask(ctx, { id: mine.id });
		expect(await repo.tasks.get(travel.id)).not.toBeNull();
	});
});

describe('endPreparation', () => {
	const started = Date.parse('2026-11-05T12:00:00Z');

	test('a preparation ends when its appointment starts and says so once', async () => {
		const { ctx, repo, prep, state } = await examWithPrep();
		state.now = started;
		const todos = await endPreparation(ctx, [prep], 'UTC');
		expect(todos[0].status).toBe('ended');
		expect(await todoOf(repo, prep.id)).toMatchObject({ status: 'ended', progress: 85 });
		const ended = (await repo.events.recent(10)).filter((event) => event.type === 'todo.ended');
		expect(ended).toMatchObject([{ origin: 'system', payload: { appointment: 'Exam Math' } }]);

		await endPreparation(ctx, [prep], 'UTC');
		expect(
			(await repo.events.recent(10)).filter((event) => event.type === 'todo.ended')
		).toHaveLength(1);
	});

	test('nothing ends before the appointment starts', async () => {
		const { ctx, repo, prep, state } = await examWithPrep();
		state.now = started - 60_000;
		expect((await endPreparation(ctx, [prep], 'UTC'))[0].status).toBe('open');
		expect((await todoOf(repo, prep.id)).status).toBe('open');
	});

	test('a to-do without an appointment, or whose appointment is gone, is left alone', async () => {
		const { ctx, repo, state } = await examWithPrep();
		state.now = started;
		const free = await repo.todos.insert({ title: 'Read', priority: 2 });
		const orphan = await repo.todos.insert({ title: 'Pack', priority: 2, parentId: 999 });
		const todos = await endPreparation(ctx, [free, orphan], 'UTC');
		expect(todos.map((todo) => todo.status)).toEqual(['open', 'open']);
	});

	test('a to-do that is done already is not touched', async () => {
		const { ctx, repo, prep, state } = await examWithPrep();
		state.now = started;
		const done = (await repo.todos.update(prep.id, { status: 'done' }))!;
		expect((await endPreparation(ctx, [done], 'UTC'))[0].status).toBe('done');
	});
});
