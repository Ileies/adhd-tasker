/**
 * The answers the user gives the flow engine ("I'm starting this", a check, a break), validated and written to
 * the flow log. The `/flow` routes call these for an account, the local backend for a guest. The log holds only
 * what the user said: what is current is replayed from it (`docs/flow-plan.md` 3.4), never stored.
 */
import { AssistantError, type Ctx } from '#lib/core/context.js';
import type { FlowRow, FlowType } from '#lib/core/repo.js';
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
	'rest',
	'undo'
];

/** A client clock this far from the server's is not believed, the row gets the server's time. */
export const CLOCK_SKEW_MS = 2 * 60_000;
/** The answers are small ("done", "a bit", a reason), more than this is not an answer. */
const MAX_DATA_CHARS = 500;
/** `pin:<session start ms>`: the same pick written twice by two screens is one row. */
const PIN_KEY = /^pin:\d{1,16}$/;

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
 * Writes one answer. `body` is `{ type, todoId?, taskId?, data?, key?, at? }`. A pin needs its `pin:<ms>` key,
 * every other type is a new row each time. Answers `null` when the key is already logged (two screens, one pick).
 */
export async function recordFlow(ctx: Ctx, body: unknown): Promise<FlowRow | null> {
	const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	if (!isFlowType(input.type)) throw new AssistantError('type must be a flow answer', 400);
	const type = input.type;

	const data = input.data ?? {};
	if (typeof data !== 'object' || data === null || Array.isArray(data))
		throw new AssistantError('data must be an object', 400);
	if (JSON.stringify(data).length > MAX_DATA_CHARS)
		throw new AssistantError('data is too long', 400);

	let key: string | null = null;
	if (type === 'pin') {
		if (typeof input.key !== 'string' || !PIN_KEY.test(input.key))
			throw new AssistantError('a pin needs a key like pin:<ms>', 400);
		key = input.key;
	}

	const serverNow = ctx.now();
	const at =
		typeof input.at === 'number' &&
		Number.isFinite(input.at) &&
		Math.abs(input.at - serverNow) <= CLOCK_SKEW_MS
			? Math.round(input.at)
			: serverNow;
	const { timezone } = await ctx.repo.settings.get();

	const row = await ctx.repo.flow.insert({
		at,
		date: todayIn(timezone, new Date(at)),
		type,
		todoId: idOf(input.todoId, 'todoId'),
		taskId: idOf(input.taskId, 'taskId'),
		data: data as Record<string, unknown>,
		key
	});
	if (row) ctx.hint({ type: 'flow' });
	return row;
}
