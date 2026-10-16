/**
 * What goes with an appointment (`docs/flow-plan.md` 5.10): its travel and the to-dos that prepare for it. These rules
 * run in every path that moves, changes or deletes a task (the Plan routes, the assistant's tools, undo and the calendar
 * sync), so travel and preparation can never be left behind.
 */
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit, emitChange } from '#lib/core/events.js';
import type { EventOrigin } from '#lib/events.js';
import type { Task, Todo, TodoPatch } from '#lib/core/repo.js';
import { moveTravel, removedLine, shiftDue } from '#lib/prep.js';
import { zonedToEpoch, type DateKey } from '#lib/time.js';

/** One task the rules changed on their own: `after` is null for a deleted one. */
export interface TaskChange {
	before: Task;
	after: Task | null;
}

/**
 * Travel leads to an appointment on its own day, an appointment has at most one travel, and nothing else has a parent.
 * `self` is the task being changed, it does not count as the travel an appointment already has.
 */
export async function checkKind(
	ctx: Ctx,
	task: { kind: Task['kind']; parentId: number | null; date: DateKey },
	self?: number
) {
	if (task.kind !== 'travel') {
		if (task.parentId !== null)
			throw new AssistantError('Only travel leads to an appointment', 400);
		return;
	}
	if (task.parentId === null)
		throw new AssistantError('Travel needs the appointment it leads to', 400);
	const parent = await ctx.repo.tasks.get(task.parentId);
	if (!parent || parent.kind !== 'appointment')
		throw new AssistantError('Travel leads to an appointment', 400);
	if (parent.date !== task.date)
		throw new AssistantError('Travel is on the day of its appointment', 400);
	const taken = (await ctx.repo.tasks.between(task.date, task.date)).some(
		(other) => other.kind === 'travel' && other.parentId === task.parentId && other.id !== self
	);
	if (taken) throw new AssistantError('That appointment has its travel already', 400);
}

async function travelsOf(ctx: Ctx, appointment: Task): Promise<Task[]> {
	return (await ctx.repo.tasks.between(appointment.date, appointment.date)).filter(
		(task) => task.kind === 'travel' && task.parentId === appointment.id
	);
}

async function preparationOf(ctx: Ctx, appointmentId: number): Promise<Todo[]> {
	return (await ctx.repo.todos.all()).filter((todo) => todo.parentId === appointmentId);
}

/**
 * An appointment was changed. When it moved, its travel keeps its gap and its length (cut short at midnight, gone when
 * nothing is left of it) and the preparation follows by the same days and minutes. A preparation that ended with the
 * appointment is open again when the appointment moved to the future. An appointment turned into a task of the user's
 * own leaves its travel as a task of its own, nothing is deleted by a tap on a chip.
 * Answers what changed, so the assistant can log it for Undo.
 */
export async function followAppointment(
	ctx: Ctx,
	before: Task,
	after: Task,
	origin: EventOrigin = 'user'
): Promise<TaskChange[]> {
	if (before.kind !== 'appointment') return [];
	const changes: TaskChange[] = [];
	const travels = await travelsOf(ctx, before);

	if (after.kind !== 'appointment') {
		for (const travel of travels) {
			const released = await ctx.repo.tasks.update(travel.id, { kind: 'block', parentId: null });
			if (released) changes.push({ before: travel, after: released });
		}
		return changes;
	}
	if (before.date === after.date && before.startTime === after.startTime) return changes;

	for (const travel of travels) {
		const placed = moveTravel(travel, before, after);
		if (!placed) {
			await ctx.repo.tasks.delete(travel.id);
			await emitChange(ctx, travel, null, origin);
			changes.push({ before: travel, after: null });
			continue;
		}
		const moved = await ctx.repo.tasks.update(travel.id, placed);
		if (!moved) continue;
		await emitChange(ctx, travel, moved, origin);
		changes.push({ before: travel, after: moved });
	}

	const { timezone } = await ctx.repo.settings.get();
	const inTheFuture =
		timezone !== null && zonedToEpoch(after.date, after.startTime, timezone) > ctx.now();
	let touched = false;
	for (const todo of await preparationOf(ctx, before.id)) {
		const patch: TodoPatch = {};
		if (todo.status === 'open' || todo.status === 'ended')
			Object.assign(patch, shiftDue(todo, before, after));
		if (todo.status === 'ended' && inTheFuture) patch.status = 'open';
		if (Object.keys(patch).length === 0) continue;
		await ctx.repo.todos.update(todo.id, patch);
		touched = true;
	}
	if (touched) ctx.hint({ type: 'todos' });
	return changes;
}

/**
 * An appointment was deleted: its travel goes with it, and what prepared for it stays due when it was, with the line
 * that says what it was for. Answers the travel that went, so the assistant can log it for Undo.
 */
export async function removeAppointmentParts(
	ctx: Ctx,
	appointment: Task,
	origin: EventOrigin = 'user'
): Promise<TaskChange[]> {
	if (appointment.kind !== 'appointment') return [];
	const changes: TaskChange[] = [];
	for (const travel of await travelsOf(ctx, appointment)) {
		await ctx.repo.tasks.delete(travel.id);
		await emitChange(ctx, travel, null, origin);
		changes.push({ before: travel, after: null });
	}
	const line = removedLine(appointment.title);
	let touched = false;
	for (const todo of await preparationOf(ctx, appointment.id)) {
		const note = todo.description.startsWith(line)
			? todo.description
			: `${line}.${todo.description ? `\n${todo.description}` : ''}`;
		await ctx.repo.todos.update(todo.id, { parentId: null, description: note });
		touched = true;
	}
	if (touched) ctx.hint({ type: 'todos' });
	return changes;
}

/**
 * The to-dos whose appointment has started end at the progress they had: they are never picked after that and never
 * missed. The flow engine already leaves them out from the minute the appointment starts, this makes it permanent
 * (and says so on the list). Answers the to-dos as they are now.
 */
export async function endPreparation(ctx: Ctx, todos: Todo[], timezone: string): Promise<Todo[]> {
	const now = ctx.now();
	const result: Todo[] = [];
	for (const todo of todos) {
		const parent =
			todo.status === 'open' && todo.parentId !== null
				? await ctx.repo.tasks.get(todo.parentId)
				: null;
		if (!parent || zonedToEpoch(parent.date, parent.startTime, timezone) > now) {
			result.push(todo);
			continue;
		}
		const ended = (await ctx.repo.todos.update(todo.id, { status: 'ended' })) ?? todo;
		result.push(ended);
		await emit(
			ctx,
			'todo.ended',
			{
				todoId: todo.id,
				title: todo.title,
				dueDate: todo.dueDate,
				progress: todo.progress,
				appointment: parent.title
			},
			'system',
			`ended:${todo.id}:${parent.id}`
		);
		ctx.hint({ type: 'todos' });
	}
	return result;
}
