/**
 * "Suggest steps" in the prep sheet (`docs/flow-plan.md` 9): one call of the `prep` use that answers with the steps that
 * prepare for an appointment. Nothing is written here: the user reads the steps in the sheet and Add makes them. The
 * same code serves an account (the `/assistant/prep` route) and a guest (the device calls OpenAI itself).
 */
import {
	PREP_TOOLS,
	PREP_TOOL_NAME,
	parseToolArguments,
	parsePrepSteps
} from '#lib/assistant-tools.js';
import { AssistantError, type Ctx } from '#lib/core/context.js';
import { recordUsage } from '#lib/core/usage.js';
import { functionCalls } from '#lib/openai.js';
import { suggestionInstructions } from '#lib/prep.js';
import { todayIn } from '#lib/time.js';
import type { PrepStep } from '#lib/assistant-tools.js';

export async function suggestPrep(ctx: Ctx, id: unknown): Promise<{ steps: PrepStep[] }> {
	if (typeof id !== 'number' || !Number.isInteger(id))
		throw new AssistantError('id must be an appointment id', 400);
	const model = ctx.model;
	if (!model) throw new AssistantError('Add your OpenAI key in Settings first', 400);
	const appointment = await ctx.repo.tasks.get(id);
	if (!appointment || appointment.kind !== 'appointment')
		throw new AssistantError('Appointment not found', 404);

	const { timezone } = await ctx.repo.settings.get();
	const existing = (await ctx.repo.todos.all())
		.filter((todo) => todo.parentId === id && todo.status === 'open')
		.map((todo) => todo.title);
	const instructions = suggestionInstructions(
		appointment,
		existing,
		todayIn(timezone ?? 'UTC', new Date(ctx.now()))
	);

	let tokens = 0;
	try {
		const response = await model.complete(
			[{ role: 'user', content: 'Suggest the steps.' }],
			instructions,
			'prep',
			PREP_TOOLS
		);
		tokens = response.usage?.total_tokens ?? 0;
		const call = functionCalls(response).find((item) => item.name === PREP_TOOL_NAME);
		const args = parseToolArguments(call?.arguments);
		const parsed = args ? parsePrepSteps(args.steps) : null;
		if (!parsed?.ok)
			throw new AssistantError('The assistant could not come up with steps, try again', 502);
		return { steps: parsed.value };
	} finally {
		await recordUsage(ctx, 'prep', tokens).catch(() => {});
	}
}
