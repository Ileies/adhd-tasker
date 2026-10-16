/**
 * The client side of to-dos and the flow log: what the screens hold in `tasker.todos` and `tasker.flow`, changed
 * at once and put back with a reason when the backend refuses (like `tasks.ts`).
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type FlowAnswer } from '#lib/backend.js';
import { checkPatch, isSlow, type CheckData } from '#lib/checks.js';
import type { FlowRow, Task, TaskKind, Todo, TodoPatch } from '#lib/core/repo.js';
import { rotationTargets } from '#lib/pick.js';
import { quickKind, quickTodo } from '#lib/quickadd.js';
import {
	coolingAt,
	liveRows,
	skipPatch,
	stepFor,
	stepsOf,
	unskipPatch,
	type FaceAnswer,
	type Struggle
} from '#lib/struggle.js';
import { addQuickTask } from '#lib/tasks.js';
import { errorText, showToast } from '#lib/toast.js';
import { deviceTimezone, formatDay, todayIn } from '#lib/time.js';

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null ? 'no connection' : errorText(error, '');

/** Today's date in the user's timezone, the day the flow log is read for. */
export const flowToday = () =>
	todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone());

/** Fetches every open to-do and the recently finished ones. */
export async function loadTodos() {
	try {
		tasker.todos = await tasker.backend.todos.load();
	} catch (error) {
		throw new Error(`Could not load the to-dos: ${reasonOf(error)}`, { cause: error });
	}
}

/** Adds a to-do. Rejects with the reason, the caller decides how to say it. */
export async function addTodo(fields: TodoPatch): Promise<Todo> {
	try {
		const created = await tasker.backend.todos.create(fields);
		tasker.todos = [...tasker.todos.filter((todo) => todo.id !== created.id), created];
		return created;
	} catch (error) {
		throw new Error(`Could not add the to-do: ${reasonOf(error)}`, { cause: error });
	}
}

/**
 * What the quick add line says: a time makes a task at a time, everything else a to-do (see `quickadd.ts`). Tells
 * the user how it went and answers what was made, `null` for a line without a title or one that failed.
 */
export async function addQuickLine(
	text: string,
	date: string,
	now: number | null,
	today: string = date,
	chosen: TaskKind | null = null
): Promise<{ kind: 'task'; task: Task } | { kind: 'todo'; todo: Todo } | null> {
	if (quickKind(text) === 'task') {
		const task = await addQuickTask(text, date, now, today, chosen);
		return task ? { kind: 'task', task } : null;
	}
	const fields = quickTodo(text, today);
	if (!fields) return null;
	try {
		const todo = await addTodo(fields);
		showToast(
			fields.dueDate
				? `Added ${todo.title}, due ${formatDay(fields.dueDate, today)}`
				: `Added ${todo.title}`
		);
		return { kind: 'todo', todo };
	} catch (error) {
		showToast(errorText(error, 'Could not add the to-do'));
		return null;
	}
}

/** Shows the change at once. When the backend refuses, the to-do goes back and a toast says why. */
export async function changeTodo(fields: TodoPatch & { id: number }) {
	const index = tasker.todos.findIndex((todo) => todo.id === fields.id);
	if (index === -1) return false;
	const previous = tasker.todos[index];
	tasker.todos[index] = {
		...previous,
		...fields,
		...(fields.status === 'done' && previous.status !== 'done' && { progress: 100 })
	};

	try {
		const stored = await tasker.backend.todos.update(fields);
		const back = tasker.todos.findIndex((todo) => todo.id === fields.id);
		if (back !== -1) tasker.todos[back] = stored;
		return true;
	} catch (error) {
		const back = tasker.todos.findIndex((todo) => todo.id === fields.id);
		if (back !== -1) tasker.todos[back] = previous;
		showToast(`Could not save ${previous.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Removes the to-do at once. When the backend refuses, it comes back in its place. */
export async function removeTodo(todo: Todo) {
	const index = tasker.todos.findIndex((entry) => entry.id === todo.id);
	tasker.todos = tasker.todos.filter((entry) => entry.id !== todo.id);

	try {
		await tasker.backend.todos.delete(todo.id);
		return true;
	} catch (error) {
		if (index !== -1 && !tasker.todos.some((entry) => entry.id === todo.id))
			tasker.todos = tasker.todos.toSpliced(index, 0, todo);
		showToast(`Could not delete ${todo.title}: ${reasonOf(error)}`);
		return false;
	}
}

/** Marks a to-do done, with an Undo toast that puts it back as it was. `onUndo` runs first (a screen's own confirmation). */
export function finishTodo(todo: Todo, onUndo?: () => void) {
	const before = { status: todo.status, progress: todo.progress };
	void changeTodo({ id: todo.id, status: 'done' });
	showToast(`Done: ${todo.title}`, () => {
		onUndo?.();
		return changeTodo({ id: todo.id, ...before });
	});
}

/** Drops a to-do, it stays in the data for a while. The Undo toast reopens it. */
export function dropTodo(todo: Todo) {
	void changeTodo({ id: todo.id, status: 'dropped' });
	showToast(`Dropped: ${todo.title}`, () => changeTodo({ id: todo.id, status: todo.status }));
}

/** "Do this now": the to-do becomes current at once and stays for this session. */
export function chooseTodo(todo: Todo) {
	return recordAnswer({ type: 'choose', todoId: todo.id });
}

/**
 * Answers a check: the to-do shows the new progress, time spent and size at once (the same rules the backend
 * applies, `checkPatch`), and the answer goes to the flow log. A refused answer puts the to-do back.
 */
export async function answerCheck(
	todo: Todo,
	data: CheckData,
	/** What the ladder needs when the answer is "I couldn't focus": the app switches or gives a break on its own. */
	struggle?: StruggleOptions
): Promise<FlowRow | null> {
	const full: CheckData = {
		...data,
		slow: !data.keep && isSlow({ ...data, size: todo.estimate })
	};
	// The ladder reads the day before this answer, so the step is worked out first
	const result =
		struggle && full.pace === 'unfocused' ? planFor(todo, 'unfocused', struggle) : null;
	const index = tasker.todos.findIndex((entry) => entry.id === todo.id);
	const previous = index === -1 ? null : tasker.todos[index];
	if (previous) tasker.todos[index] = { ...previous, ...checkPatch(previous, full) };

	const stored = await recordAnswer({ type: 'check', todoId: todo.id, data: { ...full } });
	if (!stored && previous) {
		const back = tasker.todos.findIndex((entry) => entry.id === todo.id);
		if (back !== -1) tasker.todos[back] = previous;
	}
	if (stored && result) await takeStep(todo, result, stored.at);
	return stored;
}

/** What the screen knows about the session a struggle happens in. */
export interface StruggleOptions {
	/** When the session on the to-do began, epoch ms. */
	sessionStart: number;
	/** The break length setting. */
	breakMinutes: number;
	/** The activity a break would give, chosen by the screen (`breakActivity`). */
	activity: string;
}

type Planned = NonNullable<ReturnType<typeof stepFor>>;

/** When the day's tasks and to-dos were finished: the ladder counts that as going well. */
function finishedToday(): number[] {
	const today = flowToday();
	const zone = tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone();
	return [...tasker.tasks, ...tasker.todos]
		.map((item) => item.completedAt)
		.filter((at): at is number => typeof at === 'number' && todayIn(zone, new Date(at)) === today);
}

/** The step the ladder takes for a struggle, from today's rows as they are now. `null` when the struggle does not count. */
function planFor(todo: Todo, trigger: Struggle, options: StruggleOptions): Planned | null {
	const nowMs = Date.now();
	const doneAts = finishedToday();
	const rows = liveRows(tasker.flow.rows);
	const cooling = coolingAt(stepsOf(rows, doneAts), nowMs);
	return stepFor({
		rows,
		doneAts,
		trigger,
		todoId: todo.id,
		nowMs,
		sessionStart: options.sessionStart,
		others: rotationTargets(tasker.todos, flowToday(), cooling, todo.id),
		breakMinutes: options.breakMinutes,
		activity: options.activity
	});
}

/**
 * Writes the step the ladder decided and says so with an Undo. A rotation counts as a skip of the to-do, shown at
 * once and put back when the answer is refused. `after` is the time of the answer that caused it: the step follows
 * it by a moment, so the session of the answer and the session of the step never share a pin.
 */
async function takeStep(
	todo: Todo,
	{ plan, answer }: Planned,
	after: number | null
): Promise<FlowRow | null> {
	const rotating = answer.type === 'rotate';
	const index = tasker.todos.findIndex((entry) => entry.id === todo.id);
	const previous = index === -1 ? null : tasker.todos[index];
	if (rotating && previous)
		tasker.todos[index] = { ...previous, ...skipPatch(previous, flowToday()) };

	const row = await recordAnswer({
		type: answer.type,
		todoId: answer.todoId ?? undefined,
		data: answer.data,
		...(after === null ? {} : { at: Math.max(Date.now(), after + 1) })
	});
	if (!row) {
		const back = tasker.todos.findIndex((entry) => entry.id === todo.id);
		if (rotating && previous && back !== -1) tasker.todos[back] = previous;
		return null;
	}

	const undo = () => undoStep(row, todo.id);
	if (plan.step === 'break') showToast(`Break for ${plan.minutes} min.`, undo);
	// A held rotation says it in the hero, with the timer
	else if (!plan.hold) showToast(`Switched. ${todo.title} comes back later.`, undo);
	return row;
}

/** Takes a rotation or break back: the session before goes on, a skip it counted is given back. */
export async function undoStep(row: FlowRow, todoId: number | null) {
	await recordAnswer({ type: 'undo', data: { ref: row.id } });
	const todo = tasker.todos.find((entry) => entry.id === todoId);
	if (row.type === 'rotate' && todo) await changeTodo({ id: todo.id, ...unskipPatch(todo) });
}

/**
 * "Something else", "I lost energy for this" and "I cannot get started" on a to-do: the ladder decides what happens
 * (`struggle.ts`). Answers what it did, `null` when the struggle does not count yet (the first "I cannot get started").
 */
export async function struggleOn(
	todo: Todo,
	trigger: 'else' | 'low-energy' | 'cant-start',
	options: StruggleOptions
): Promise<Planned['plan'] | null> {
	const result = planFor(todo, trigger, options);
	// The tap itself is logged: the ladder counts it, "I cannot get started" the second time
	if (trigger !== 'else')
		await recordAnswer({ type: 'stuck', todoId: todo.id, data: { reason: trigger } });
	if (!result) return null;
	await takeStep(todo, result, null);
	return result.plan;
}

/** A break the user asked for ("I need a break", Take a break), or "5 more minutes" after one. */
export function takeBreak(
	minutes: number,
	activity: string,
	why: 'asked' | 'stuck' | 'offer' = 'asked'
) {
	return recordAnswer({ type: 'break', data: { minutes, activity, why } });
}

/** "I'm back" from a break, "Let's go" after it. */
export const endBreak = () => recordAnswer({ type: 'back' });

/** The answer to the question at the end of a Face it session: the count ends, the to-do stays what the user says. */
export async function answerFace(todo: Todo, answer: FaceAnswer) {
	const index = tasker.todos.findIndex((entry) => entry.id === todo.id);
	const previous = index === -1 ? null : tasker.todos[index];
	if (previous) tasker.todos[index] = { ...previous, skips: 0, skipSince: null };
	const row = await recordAnswer({ type: 'face', todoId: todo.id, data: { answer } });
	if (!row && previous) {
		const back = tasker.todos.findIndex((entry) => entry.id === todo.id);
		if (back !== -1) tasker.todos[back] = previous;
	}
	return row;
}

/** Fetches the answers of one day (today without a date) and replaces what the client holds. */
export async function loadFlow(date: string = flowToday()) {
	try {
		tasker.flow = { date, rows: await tasker.backend.flow.load(date) };
	} catch (error) {
		throw new Error(`Could not load today's answers: ${reasonOf(error)}`, { cause: error });
	}
}

let nextLocalId = -1;

/**
 * Logs one answer and shows it at once, with a temporary negative id until the backend answers. A day that
 * rolled over meanwhile is loaded first. Answers the stored row, `null` when its key was logged already or the
 * backend refused (a toast says why).
 */
export async function recordAnswer(answer: FlowAnswer): Promise<FlowRow | null> {
	const at = answer.at ?? Date.now();
	const date = flowToday();
	if (tasker.flow.date !== date) tasker.flow = { date, rows: [] };
	const draft: FlowRow = {
		id: nextLocalId--,
		at,
		date,
		type: answer.type,
		todoId: answer.todoId ?? null,
		taskId: answer.taskId ?? null,
		data: answer.data ?? {},
		key: answer.key ?? null
	};
	tasker.flow.rows = [...tasker.flow.rows, draft];
	const without = () => tasker.flow.rows.filter((row) => row.id !== draft.id);

	try {
		const stored = await tasker.backend.flow.record({ ...answer, at });
		// A fetch that came in meanwhile (the hint of this very answer) replaced the draft with the stored row already
		const known = tasker.flow.rows.some((row) => row.id === stored?.id);
		tasker.flow.rows =
			stored && !known
				? tasker.flow.rows.some((row) => row.id === draft.id)
					? tasker.flow.rows.map((row) => (row.id === draft.id ? stored : row))
					: [...tasker.flow.rows, stored]
				: without();
		return stored;
	} catch (error) {
		tasker.flow.rows = without();
		showToast(`Could not save that: ${reasonOf(error)}`);
		return null;
	}
}
