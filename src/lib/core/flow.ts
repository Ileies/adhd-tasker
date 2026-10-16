/**
 * The answers the user gives the flow engine ("I'm starting this", a check, a break), validated and written to
 * the flow log. The `/flow` routes call these for an account, the local backend for a guest. The log holds only
 * what the user said: what is current is replayed from it (`docs/flow-plan.md` 3.4), never stored.
 */
import { checkPatch, isSlow, parseCheckData, type CheckData } from '#lib/checks.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { emit } from '#lib/core/events.js';
import type { FlowRow, FlowType, Todo } from '#lib/core/repo.js';
import { parseStepData, skipPatch } from '#lib/struggle.js';
import { todayIn } from '#lib/time.js';

export const FLOW_TYPES: readonly FlowType[] = [
	'start',
	'pin',
	'check',
	'choose',
	'rotate',
	'stuck',
	'break',
	'back',
	'face',
	'rest',
	'undo'
];

/** A client clock this far from the server's is not believed, the row gets the server's time. */
export const CLOCK_SKEW_MS = 2 * 60_000;
/** The answers are small ("done", "a bit", a reason), more than this is not an answer. */
const MAX_DATA_CHARS = 500;
/** `pin:<session start ms>`, `:<n>` when a pinned to-do is gone: the same pick written twice by two screens is one row. */
const PIN_KEY = /^pin:\d{1,16}(:\d{1,3})?$/;

export const isFlowType = (value: unknown): value is FlowType =>
	FLOW_TYPES.includes(value as FlowType);

const idOf = (value: unknown, name: string): number | null => {
	if (value === undefined || value === null) return null;
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
	throw new AssistantError(`${name} must be an id`, 400);
};

/** Today's rows, oldest first. `date` is `YYYY-MM-DD` in the user's timezone. */
export async function loadFlow(ctx: Ctx, date: string): Promise<FlowRow[]> {
	return ctx.repo.flow.day(date);
}

/**
 * An answered check changes the to-do it was about: its progress, the time spent and the size (typed or learned
 * from the pace). Answers the data to store, with `slow` worked out from the size the to-do had.
 */
async function applyCheck(ctx: Ctx, todoId: number | null, raw: object): Promise<CheckData> {
	if (todoId === null) throw new AssistantError('a check is about a to-do', 400);
	const parsed = parseCheckData(raw);
	if (!parsed.ok) throw new AssistantError(parsed.error, 400);
	const todo = await ctx.repo.todos.get(todoId);
	if (!todo || todo.status !== 'open') throw new AssistantError('To-do not found', 404);

	const data: CheckData = {
		...parsed.value,
		slow: !parsed.value.keep && isSlow({ ...parsed.value, size: todo.estimate })
	};
	await ctx.repo.todos.update(todoId, checkPatch(todo, data));
	ctx.hint({ type: 'todos' });
	return data;
}

/**
 * Pushing a to-do away counts a skip (and the day of the first one), a Face it answer ends the count. The to-do must be
 * open, the same as for a check.
 */
async function applyStep(
	ctx: Ctx,
	type: 'rotate' | 'face',
	todoId: number | null,
	date: string
): Promise<Todo> {
	if (todoId === null) throw new AssistantError(`a ${type} is about a to-do`, 400);
	const todo = await ctx.repo.todos.get(todoId);
	if (!todo || todo.status !== 'open') throw new AssistantError('To-do not found', 404);
	await ctx.repo.todos.update(
		todoId,
		type === 'rotate' ? skipPatch(todo, date) : { skips: 0, skipSince: null }
	);
	ctx.hint({ type: 'todos' });
	return todo;
}

/**
 * Writes one answer. `body` is `{ type, todoId?, taskId?, data?, key?, at? }`. A pin needs its `pin:<ms>` key,
 * every other type is a new row each time. Answers `null` when the key is already logged (two screens, one pick).
 */
export async function recordFlow(ctx: Ctx, body: unknown): Promise<FlowRow | null> {
	const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	if (!isFlowType(input.type)) throw new AssistantError('type must be a flow answer', 400);
	const type = input.type;

	let data = input.data ?? {};
	if (typeof data !== 'object' || data === null || Array.isArray(data))
		throw new AssistantError('data must be an object', 400);
	if (JSON.stringify(data).length > MAX_DATA_CHARS)
		throw new AssistantError('data is too long', 400);

	const todoId = idOf(input.todoId, 'todoId');
	if (type === 'check') data = await applyCheck(ctx, todoId, data);

	let key: string | null = null;
	if (type === 'pin') {
		if (typeof input.key !== 'string' || !PIN_KEY.test(input.key))
			throw new AssistantError('a pin needs a key like pin:<ms>', 400);
		key = input.key;
		// A pin says only whether its session is a Face it session
		data = (data as Record<string, unknown>).face === true ? { face: true } : {};
	}

	const serverNow = ctx.now();
	const at =
		typeof input.at === 'number' &&
		Number.isFinite(input.at) &&
		Math.abs(input.at - serverNow) <= CLOCK_SKEW_MS
			? Math.round(input.at)
			: serverNow;
	const { timezone } = await ctx.repo.settings.get();
	const date = todayIn(timezone, new Date(at));
	// The to-do a rotation moved the user away from, for the event the assistant may answer
	let rotated: Todo | null = null;

	if (
		type === 'rotate' ||
		type === 'break' ||
		type === 'stuck' ||
		type === 'face' ||
		type === 'back'
	) {
		const parsed = parseStepData(type, data as Record<string, unknown>);
		if (!parsed.ok) throw new AssistantError(parsed.error, 400);
		data = parsed.value;
		if (type === 'rotate' || type === 'face') rotated = await applyStep(ctx, type, todoId, date);
		else if (type === 'stuck' && todoId !== null && !(await ctx.repo.todos.get(todoId)))
			throw new AssistantError('To-do not found', 404);
	}

	const row = await ctx.repo.flow.insert({
		at,
		date,
		type,
		todoId,
		taskId: idOf(input.taskId, 'taskId'),
		data: data as Record<string, unknown>,
		key
	});
	if (row) ctx.hint({ type: 'flow' });
	// Every rotation is a struggle (`why`): the assistant may answer it with a small step
	if (row && type === 'rotate' && rotated)
		await emit(
			ctx,
			'focus.rotated',
			{ todoId: rotated.id, title: rotated.title, why: (data as { why: string }).why },
			'user'
		);
	return row;
}
