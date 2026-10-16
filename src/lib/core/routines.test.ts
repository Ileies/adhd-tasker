/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	createRoutine,
	deleteRoutine,
	loadRoutines,
	makeRoutines,
	updateRoutine
} from '#lib/core/routines.js';
import { MAX_ROUTINES } from '#lib/routine-input.js';
import { TaskStatus } from '#lib/types.js';
import { testCtx } from '#test/ctx.js';

// The test clock is 2026-10-14 09:00 UTC, a Wednesday, in a UTC user
const TODAY = '2026-10-14';
const DAY_MS = 86_400_000;

/** What a call that is refused throws (`null` when it did not). */
const refusal = (call: Promise<unknown>) =>
	call.then(
		() => null,
		(error: unknown) => error
	);

const lunch = { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily', shift: 60 };

const days = async (ctx: Awaited<ReturnType<typeof testCtx>>, from = '0000-01-01') =>
	(await ctx.repo.tasks.between(from)).map((task) => task.date);

describe('createRoutine', () => {
	test('makes today and the 13 days after it, each with the routine', async () => {
		const world = await testCtx();
		const routine = await createRoutine(world.ctx, lunch);
		const tasks = await world.repo.tasks.between('0000-01-01');
		expect(tasks).toHaveLength(14);
		expect(tasks[0]).toMatchObject({
			title: 'Lunch',
			date: TODAY,
			startTime: 720,
			duration: 45,
			shift: 60,
			routineId: routine.id,
			kind: 'block'
		});
		expect(tasks.at(-1)!.date).toBe('2026-10-27');
		expect(routine.through).toBe('2026-10-27');
	});

	test('weekdays make no weekend task', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, { ...lunch, repeat: 'weekdays' });
		expect(
			(await days(world)).filter((date) => ['2026-10-17', '2026-10-18'].includes(date))
		).toEqual([]);
		expect(await days(world)).toHaveLength(10);
	});

	test('a routine that starts later makes nothing before it', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, { ...lunch, firstDay: '2026-10-20' });
		expect((await days(world))[0]).toBe('2026-10-20');
	});

	test('does not write events for the agent to react to', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, lunch);
		expect(await world.repo.events.recent(10)).toEqual([]);
	});

	test('refuses what the validator refuses, with status 400', async () => {
		const { ctx } = await testCtx();
		expect(await refusal(createRoutine(ctx, { ...lunch, repeat: 'none' }))).toMatchObject({
			status: 400
		});
	});

	test('stops at the limit', async () => {
		const world = await testCtx();
		for (let i = 0; i < MAX_ROUTINES; i++)
			await world.repo.routines.insert({
				title: `r${i}`,
				priority: 2,
				startTime: 600,
				duration: 15,
				repeat: 'daily',
				firstDay: TODAY,
				through: '2026-10-27'
			});
		expect(await refusal(createRoutine(world.ctx, lunch))).toMatchObject({ status: 400 });
	});
});

describe('makeRoutines', () => {
	test('makes nothing more on the same day, one more on the next', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, lunch);
		expect(await makeRoutines(world.ctx, TODAY)).toBe(0);
		expect(await makeRoutines(world.ctx, '2026-10-15')).toBe(1);
		expect((await days(world)).at(-1)).toBe('2026-10-28');
	});

	test('a day the user deleted is not made again', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, lunch);
		const gone = (await world.repo.tasks.between('2026-10-16', '2026-10-16'))[0];
		await world.repo.tasks.delete(gone.id);
		await makeRoutines(world.ctx, '2026-10-15');
		await makeRoutines(world.ctx, '2026-10-16');
		expect(await days(world)).not.toContain('2026-10-16');
	});

	test('running it twice before it is recorded makes no day twice', async () => {
		const world = await testCtx();
		const routine = await world.repo.routines.insert({
			title: 'Meds',
			priority: 3,
			startTime: 480,
			duration: 5,
			repeat: 'daily',
			firstDay: TODAY
		});
		// The tick that made the tasks died before it saved `through`
		await world.repo.tasks.insert({
			title: 'Meds',
			description: '',
			date: TODAY,
			startTime: 480,
			duration: 5,
			priority: 3,
			routineId: routine.id
		});
		await makeRoutines(world.ctx, TODAY);
		const dates = await days(world);
		expect(new Set(dates).size).toBe(dates.length);
		expect(dates).toHaveLength(14);
	});

	test('after a week away it starts at today and leaves the past alone', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, lunch);
		world.state.now += 20 * DAY_MS;
		await makeRoutines(world.ctx, '2026-11-03');
		const dates = await days(world, '2026-10-28');
		expect(dates[0]).toBe('2026-11-03');
		expect(dates).not.toContain('2026-10-30');
	});

	test('a task of the user on the same day is no reason to skip the day', async () => {
		const world = await testCtx();
		await world.repo.tasks.insert({
			title: 'Own',
			description: '',
			date: TODAY,
			startTime: 720,
			duration: 45,
			priority: 2
		});
		await createRoutine(world.ctx, lunch);
		expect(await world.repo.tasks.between(TODAY, TODAY)).toHaveLength(2);
	});
});

describe('updateRoutine', () => {
	const made = async () => {
		const world = await testCtx();
		const routine = await createRoutine(world.ctx, lunch);
		return { ...world, routine };
	};

	test('a new time moves every task that follows the routine', async () => {
		const { ctx, repo, routine } = await made();
		await updateRoutine(ctx, { id: routine.id, startTime: 750 });
		const tasks = await repo.tasks.between('0000-01-01');
		expect(tasks).toHaveLength(14);
		expect(tasks.every((task) => task.startTime === 750)).toBe(true);
	});

	test('a day the user changed keeps its changes', async () => {
		const { ctx, repo, routine } = await made();
		const own = (await repo.tasks.between('2026-10-16', '2026-10-16'))[0];
		await repo.tasks.update(own.id, { startTime: 800 });
		await updateRoutine(ctx, { id: routine.id, startTime: 750 });
		expect((await repo.tasks.get(own.id))!.startTime).toBe(800);
		expect((await repo.tasks.between('2026-10-15', '2026-10-15'))[0].startTime).toBe(750);
	});

	test('a finished day stays as it was', async () => {
		const { ctx, repo, routine } = await made();
		const first = (await repo.tasks.between(TODAY, TODAY))[0];
		await repo.tasks.update(first.id, { status: TaskStatus.Completed, completedAt: 1 });
		await updateRoutine(ctx, { id: routine.id, title: 'Meal' });
		expect(await repo.tasks.between(TODAY, TODAY)).toMatchObject([{ title: 'Lunch' }]);
	});

	test('days it no longer has lose their task, new days get one', async () => {
		const { ctx, repo, routine } = await made();
		await updateRoutine(ctx, { id: routine.id, repeat: 'weekdays' });
		expect(await repo.tasks.between('2026-10-17', '2026-10-18')).toEqual([]);
		await updateRoutine(ctx, { id: routine.id, repeat: 'daily' });
		expect(await repo.tasks.between('0000-01-01')).toHaveLength(14);
	});

	test('changing it back is the Undo and leaves the same days', async () => {
		const { ctx, repo, routine } = await made();
		await updateRoutine(ctx, { id: routine.id, startTime: 750, title: 'Meal' });
		await updateRoutine(ctx, { id: routine.id, startTime: 720, title: 'Lunch' });
		const tasks = await repo.tasks.between('0000-01-01');
		expect(tasks).toHaveLength(14);
		expect(tasks.every((task) => task.startTime === 720 && task.title === 'Lunch')).toBe(true);
	});

	test('answers the routine as stored', async () => {
		const { ctx, routine } = await made();
		expect(await updateRoutine(ctx, { id: routine.id, title: 'Meal' })).toMatchObject({
			title: 'Meal',
			through: '2026-10-27'
		});
	});

	test('a missing routine is 404, a missing id 400, an empty change 400', async () => {
		const { ctx, routine } = await made();
		expect(await refusal(updateRoutine(ctx, { id: 99, title: 'x' }))).toMatchObject({
			status: 404
		});
		expect(await refusal(updateRoutine(ctx, { title: 'x' }))).toMatchObject({ status: 400 });
		expect(await refusal(updateRoutine(ctx, { id: routine.id }))).toMatchObject({ status: 400 });
	});

	test('a time that no longer fits with the saved duration is refused', async () => {
		const { ctx, routine } = await made();
		expect(await refusal(updateRoutine(ctx, { id: routine.id, startTime: 1430 }))).toMatchObject({
			status: 400
		});
	});

	test('a last day before the saved first day is refused', async () => {
		const { ctx, routine } = await made();
		expect(
			await refusal(updateRoutine(ctx, { id: routine.id, lastDay: '2026-10-01' }))
		).toMatchObject({ status: 400 });
	});

	test('does not touch tasks of other routines or of the user', async () => {
		const { ctx, repo, routine } = await made();
		await repo.tasks.insert({
			title: 'Lunch',
			description: '',
			date: TODAY,
			startTime: 720,
			duration: 45,
			priority: 2
		});
		await updateRoutine(ctx, { id: routine.id, startTime: 750 });
		const own = (await repo.tasks.between(TODAY, TODAY)).find((task) => task.routineId === null);
		expect(own!.startTime).toBe(720);
	});
});

describe('deleteRoutine', () => {
	test('removes the routine and its tasks from today on and answers it', async () => {
		const world = await testCtx();
		const routine = await createRoutine(world.ctx, lunch);
		expect(await deleteRoutine(world.ctx, { id: routine.id })).toEqual(routine);
		expect(await world.repo.routines.all()).toEqual([]);
		expect(await world.repo.tasks.between('0000-01-01')).toEqual([]);
	});

	test('keeps what is history or done and what is the own task of the user', async () => {
		const world = await testCtx();
		const routine = await createRoutine(world.ctx, lunch);
		const done = (await world.repo.tasks.between(TODAY, TODAY))[0];
		await world.repo.tasks.update(done.id, { status: TaskStatus.Completed, completedAt: 1 });
		await world.repo.tasks.insert({
			title: 'Yesterday',
			description: '',
			date: '2026-10-13',
			startTime: 720,
			duration: 45,
			priority: 2,
			routineId: routine.id
		});
		await world.repo.tasks.insert({
			title: 'Own',
			description: '',
			date: '2026-10-15',
			startTime: 900,
			duration: 30,
			priority: 2
		});
		await deleteRoutine(world.ctx, { id: routine.id });
		expect((await world.repo.tasks.between('0000-01-01')).map((task) => task.title)).toEqual([
			'Yesterday',
			'Lunch',
			'Own'
		]);
	});

	test('making the answer again is the Undo', async () => {
		const world = await testCtx();
		const routine = await createRoutine(world.ctx, lunch);
		const gone = await deleteRoutine(world.ctx, { id: routine.id });
		await createRoutine(world.ctx, gone);
		expect(await world.repo.routines.all()).toHaveLength(1);
		expect(await world.repo.tasks.between('0000-01-01')).toHaveLength(14);
	});

	test('a missing routine is 404, a missing id 400', async () => {
		const { ctx } = await testCtx();
		expect(await refusal(deleteRoutine(ctx, { id: 5 }))).toMatchObject({ status: 404 });
		expect(await refusal(deleteRoutine(ctx, {}))).toMatchObject({ status: 400 });
	});
});

describe('loadRoutines', () => {
	test('lists every routine, oldest first', async () => {
		const world = await testCtx();
		await createRoutine(world.ctx, lunch);
		await createRoutine(world.ctx, { ...lunch, title: 'Meds' });
		expect((await loadRoutines(world.ctx)).map((routine) => routine.title)).toEqual([
			'Lunch',
			'Meds'
		]);
	});
});
