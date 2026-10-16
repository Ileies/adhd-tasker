/**
 * Routines (`docs/flow-plan.md` 5.12): tasks at a time that repeat. A routine is made into ordinary tasks 14 days ahead,
 * by every tick that finds a day missing and right after an edit. The `/routines` routes call the edits for an account,
 * the local backend for a guest, so both behave alike. The made tasks are plain writes to the repo: a routine is not a
 * thousand plan edits for the agent to react to. Failures are `AssistantError`s with the reason to show.
 */
import { AssistantError, type Ctx } from '#lib/core/context.js';
import type { Routine } from '#lib/core/repo.js';
import {
	daysToMake,
	horizon,
	needsMaking,
	planDelete,
	planEdit,
	routineTask
} from '#lib/recurrence.js';
import {
	MAX_ROUTINES,
	newRoutineOf,
	parseRoutineId,
	parseRoutineInput
} from '#lib/routine-input.js';
import { fitsInDay } from '#lib/task-input.js';
import { todayIn } from '#lib/time.js';

async function todayOf(ctx: Ctx) {
	const { timezone } = await ctx.repo.settings.get();
	return todayIn(timezone ?? 'UTC', new Date(ctx.now()));
}

/** The tasks a routine made, from `from` on. */
async function tasksOf(ctx: Ctx, routine: Routine, from: string) {
	return (await ctx.repo.tasks.between(from)).filter((task) => task.routineId === routine.id);
}

export const loadRoutines = (ctx: Ctx): Promise<Routine[]> => ctx.repo.routines.all();

/**
 * Makes the tasks of every routine that is behind, for the 14 days from `today`. Safe to run any number of times and
 * on two devices at once: a day that has its task already is skipped. Answers how many tasks it made.
 */
export async function makeRoutines(ctx: Ctx, today: string): Promise<number> {
	let made = 0;
	for (const routine of await ctx.repo.routines.all()) {
		if (!needsMaking(routine, today)) continue;
		const days = daysToMake(routine, today);
		if (days.length > 0) {
			const have = new Set((await tasksOf(ctx, routine, days[0])).map((task) => task.date));
			for (const date of days) {
				if (have.has(date)) continue;
				await ctx.repo.tasks.insert(routineTask(routine, date));
				made++;
			}
		}
		await ctx.repo.routines.update(routine.id, { through: horizon(today) });
	}
	// Another open screen has not seen these days yet
	if (made > 0) ctx.hint({ type: 'routines' });
	return made;
}

export async function createRoutine(ctx: Ctx, body: unknown): Promise<Routine> {
	const parsed = parseRoutineInput(body, 'create');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	if ((await ctx.repo.routines.all()).length >= MAX_ROUTINES)
		throw new AssistantError(`At most ${MAX_ROUTINES} routines`, 400);

	const today = await todayOf(ctx);
	const created = await ctx.repo.routines.insert(newRoutineOf(parsed.value, today));
	await makeRoutines(ctx, today);
	ctx.hint({ type: 'routines' });
	return (await ctx.repo.routines.get(created.id)) ?? created;
}

/**
 * `body` is the routine with its `id` and any fields to change. Its tasks from today on follow, except the ones the
 * user changed or finished. Changing it back to what it was is the Undo.
 */
export async function updateRoutine(ctx: Ctx, body: unknown): Promise<Routine> {
	const id = parseRoutineId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a routine id', 400);
	const parsed = parseRoutineInput(body, 'update');
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);

	const before = await ctx.repo.routines.get(id);
	if (!before) throw new AssistantError('Routine not found', 404);
	const after = { ...before, ...parsed.value };
	// A time alone is checked against the saved duration, a first day against the saved last day
	if (!fitsInDay(after))
		throw new AssistantError('routines cannot cross midnight, split the routine', 400);
	if (after.lastDay !== null && after.lastDay < after.firstDay)
		throw new AssistantError('lastDay is before firstDay', 400);

	const today = await todayOf(ctx);
	const edit = planEdit(before, after, await tasksOf(ctx, before, today), today);
	const saved = await ctx.repo.routines.update(id, { ...parsed.value, through: horizon(today) });
	if (!saved) throw new AssistantError('Routine not found', 404);
	for (const { id: taskId, patch } of edit.change) await ctx.repo.tasks.update(taskId, patch);
	for (const taskId of edit.remove) await ctx.repo.tasks.delete(taskId);
	for (const date of edit.make) await ctx.repo.tasks.insert(routineTask(saved, date));
	ctx.hint({ type: 'routines' });
	return saved;
}

/**
 * Removes the routine and its tasks from today on that are not done. Days before are history and stay. Answers the
 * routine as it was, so the client can make it again for an Undo.
 */
export async function deleteRoutine(ctx: Ctx, body: unknown): Promise<Routine> {
	const id = parseRoutineId((body as { id?: unknown } | null)?.id);
	if (id === undefined) throw new AssistantError('id must be a routine id', 400);
	const before = await ctx.repo.routines.get(id);
	if (!before) throw new AssistantError('Routine not found', 404);

	const today = await todayOf(ctx);
	for (const taskId of planDelete(await tasksOf(ctx, before, today), today))
		await ctx.repo.tasks.delete(taskId);
	await ctx.repo.routines.delete(id);
	ctx.hint({ type: 'routines' });
	return before;
}
