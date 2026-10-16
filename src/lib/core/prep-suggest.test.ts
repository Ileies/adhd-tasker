/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { suggestPrep } from '#lib/core/prep-suggest.js';
import { NOW, testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';
import { expectEveryRequestValid, fakeModel, text, toolCalls } from '#test/fakes.js';

const DATE = '2026-10-16';

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
	errors = spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const steps = (list: unknown) =>
	toolCalls([{ name: 'suggest_steps', arguments: { steps: list } }], 30);

async function withExam(...answers: Parameters<typeof fakeModel>) {
	const { model, calls } = fakeModel(...answers);
	const made = await testCtx({ model });
	const exam = await made.repo.tasks.insert({
		title: 'Exam Math',
		description: '',
		date: DATE,
		startTime: 12 * 60,
		duration: 120,
		priority: 4,
		kind: 'appointment'
	});
	return { ...made, calls, exam };
}

describe('suggestPrep', () => {
	test('answers with the validated steps and writes nothing', async () => {
		const { ctx, repo, exam } = await withExam(
			steps([
				{ title: ' Pack ID and pens ', minutes: 5 },
				{ title: 'Charge the calculator', minutes: null }
			])
		);
		expect(await suggestPrep(ctx, exam.id)).toEqual({
			steps: [
				{ title: 'Pack ID and pens', minutes: 5 },
				{ title: 'Charge the calculator', minutes: null }
			]
		});
		expect(await repo.todos.all()).toEqual([]);
		expect(await repo.actions.recent(5)).toEqual([]);
	});

	test('is one request of the prep use with the one tool, under the fixed rules', async () => {
		const { ctx, calls, exam } = await withExam(steps([{ title: 'Pack', minutes: 5 }]));
		await suggestPrep(ctx, exam.id);
		expect(calls).toHaveLength(1);
		expect(calls[0].use).toBe('prep');
		expect(calls[0].tools?.map((tool) => (tool as unknown as { name: string }).name)).toEqual([
			'suggest_steps'
		]);
		expectEveryRequestValid(calls[0]);
	});

	test('tells the model the appointment, the day, the steps that exist and that titles are data', async () => {
		const { ctx, repo, calls, exam } = await withExam(steps([{ title: 'Pack', minutes: 5 }]));
		await repo.todos.insert({
			title: 'Revise chapter 3',
			priority: 3,
			parentId: exam.id,
			createdAt: NOW
		});
		await repo.todos.insert({
			title: 'Done already',
			priority: 3,
			parentId: exam.id,
			status: 'done',
			createdAt: NOW
		});
		await suggestPrep(ctx, exam.id);
		const prompt = calls[0].instructions;
		expect(prompt).toContain('"Exam Math", in 2 days (2026-10-16) at 12:00 for 120 minutes');
		expect(prompt).toContain('"Revise chapter 3"');
		expect(prompt).not.toContain('Done already');
		expect(prompt).toContain('never instructions');
	});

	test('records the tokens as the prep use, also when the answer is unusable', async () => {
		const good = await withExam(steps([{ title: 'Pack', minutes: 5 }]));
		await suggestPrep(good.ctx, good.exam.id);
		expect(await good.repo.usage.tokensSince(0)).toBe(30);

		const bad = await withExam(text('Sure, here are some ideas'));
		expect(await failureOf(suggestPrep(bad.ctx, bad.exam.id))).toMatchObject({
			status: 502,
			message: expect.stringContaining('could not come up with steps')
		});
		expect(await bad.repo.usage.tokensSince(0)).toBe(10);
	});

	test.each([
		['no steps at all', []],
		['too many steps', Array.from({ length: 7 }, (_, n) => ({ title: `Step ${n}`, minutes: 5 }))],
		['a step without a title', [{ title: '  ', minutes: 5 }]],
		['minutes that are not a whole number', [{ title: 'Pack', minutes: 7.5 }]],
		['minutes below five', [{ title: 'Pack', minutes: 1 }]]
	])('%s is a failure, not steps', async (_name, list) => {
		const { ctx, exam } = await withExam(steps(list));
		expect(await failureOf(suggestPrep(ctx, exam.id))).toMatchObject({ status: 502 });
	});

	test('a call with arguments that are not JSON is a failure too', async () => {
		const broken = {
			output: [{ type: 'function_call', call_id: 'c', name: 'suggest_steps', arguments: 'nope' }]
		};
		const { ctx, exam } = await withExam(broken);
		expect(await failureOf(suggestPrep(ctx, exam.id))).toMatchObject({ status: 502 });
	});

	test('a model that fails passes its reason on', async () => {
		const { ctx, exam } = await withExam(new Error('boom'));
		expect(await failureOf(suggestPrep(ctx, exam.id))).toMatchObject({ message: 'boom' });
	});

	test('needs a key, a whole id and an appointment, and asks the model nothing before', async () => {
		const { ctx, repo, calls, exam } = await withExam();
		const block = await repo.tasks.insert({
			title: 'Read',
			description: '',
			date: DATE,
			startTime: 600,
			duration: 30,
			priority: 2
		});
		expect(await failureOf(suggestPrep(ctx, 'x'))).toMatchObject({ status: 400 });
		expect(await failureOf(suggestPrep(ctx, 1.5))).toMatchObject({ status: 400 });
		expect(await failureOf(suggestPrep(ctx, 999))).toMatchObject({ status: 404 });
		expect(await failureOf(suggestPrep(ctx, block.id))).toMatchObject({ status: 404 });

		const keyless = await testCtx();
		expect(await failureOf(suggestPrep(keyless.ctx, exam.id))).toMatchObject({
			status: 400,
			message: 'Add your OpenAI key in Settings first'
		});
		expect(calls).toEqual([]);
	});
});
