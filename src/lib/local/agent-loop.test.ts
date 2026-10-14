/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { Hint, Model } from '#lib/core/context.js';
import { addUserAlarm } from '#lib/core/schedule.js';
import { createPlanTask } from '#lib/core/plan.js';
import { createAgentLoop } from '#lib/local/agent-loop.js';
import type { ResponseBody } from '#lib/openai.js';
import { TaskStatus } from '#lib/types.js';
import { NOW, testCtx } from '#test/ctx.js';

const MIN = 60_000;

const say = (text: string): ResponseBody => ({
	output: [
		{ type: 'function_call', call_id: 'c1', name: 'say', arguments: JSON.stringify({ text }) }
	],
	usage: { total_tokens: 12 }
});
const nothing: ResponseBody = { output: [] };

/** A model that answers with the given responses in order and counts its calls. */
function fakeModel(...answers: ResponseBody[]) {
	const state = { calls: 0 };
	const model: Model = { complete: async () => answers[state.calls++] ?? nothing };
	return { model, state };
}

async function setup(options: { key?: string; model?: Model; coalesceMs?: number } = {}) {
	const made = await testCtx();
	const hints: Hint[] = [];
	if (options.key) await made.repo.settings.update({ openaiKey: options.key });
	const loop = createAgentLoop({
		repo: made.repo,
		now: () => made.state.now,
		hint: (message) => hints.push(message),
		coalesceMs: options.coalesceMs ?? 1,
		modelFor: () => options.model ?? fakeModel().model
	});
	return { ...made, loop, hints };
}

const logCompleted = (repo: Awaited<ReturnType<typeof setup>>['repo'], createdAt = NOW) =>
	repo.events.insert({
		type: 'task.completed',
		payload: { title: 'x' },
		origin: 'user',
		createdAt
	});

describe('tick', () => {
	test('rings an alarm that came due', async () => {
		const { ctx, loop, hints, state } = await setup();
		await addUserAlarm(ctx, { in_minutes: 5, label: 'Stretch', tone: 'chime' }, 'UTC');
		state.now = NOW + 5 * MIN;
		await loop.tick();
		expect(hints.find((hint) => hint.type === 'alarm')).toMatchObject({ label: 'Stretch' });
	});

	test('logs a task switch as a system event', async () => {
		const { ctx, repo, loop, state } = await setup();
		const first = await createPlanTask(ctx, {
			title: 'A',
			description: '',
			date: '2026-10-14',
			startTime: 540,
			duration: 60,
			priority: 3
		});
		await loop.tick(); // first sighting, nothing to report
		expect((await repo.settings.get()).lastCurrentTaskId).toBe(first.id);
		await repo.tasks.update(first.id, { status: TaskStatus.Completed });
		state.now = NOW + MIN;
		await loop.tick();
		expect((await repo.events.recent(10)).map((event) => event.type)).toContain('task.switched');
		expect((await repo.settings.get()).lastCurrentTaskId).toBe(0);
	});

	test('reacts to events nobody is waiting on, such as ones left from a closed tab', async () => {
		const { model, state: calls } = fakeModel(say('Well done'));
		const { repo, loop, state } = await setup({ key: 'sk-test', model });
		await logCompleted(repo);
		state.now = NOW + 10_000;
		await loop.tick();
		expect(calls.calls).toBeGreaterThan(0);
		expect((await repo.events.unhandled()).length).toBe(0);
	});

	test('prunes old rows once an hour, not on every tick', async () => {
		const { repo, loop, state } = await setup();
		await repo.events.insert({
			type: 'task.completed',
			payload: {},
			origin: 'user',
			createdAt: NOW - 40 * 86_400_000,
			handledAt: NOW - 40 * 86_400_000,
			outcome: 'old'
		});
		state.now = NOW;
		await loop.tick();
		expect((await repo.events.recent(10)).filter((e) => e.outcome === 'old')).toEqual([]);
	});
});

describe('reactions', () => {
	test('a reaction shows the agent card and tells the screens', async () => {
		const { model } = fakeModel(say('Nice work'));
		const { repo, loop, hints } = await setup({ key: 'sk-test', model });
		await logCompleted(repo);
		await loop.reactNow();
		expect((await repo.cards.open())?.text).toBe('Nice work');
		expect(hints).toContainEqual({ type: 'agent' });
		expect((await repo.events.recent(1))[0].outcome).toBe('reacted: say');
	});

	test('without a key the agent stays silent and says why', async () => {
		const { repo, loop } = await setup();
		await logCompleted(repo);
		await loop.reactNow();
		expect((await repo.events.recent(1))[0].outcome).toBe('silent: no OpenAI key');
		expect(await repo.cards.open()).toBeNull();
	});

	test('observe autonomy only logs, the model is never called', async () => {
		const { model, state: calls } = fakeModel(say('x'));
		const { repo, loop } = await setup({ key: 'sk-test', model });
		await repo.settings.update({ aiAutonomy: 'observe' });
		await logCompleted(repo);
		await loop.reactNow();
		expect(calls.calls).toBe(0);
		expect((await repo.events.recent(1))[0].outcome).toStartWith('silent');
	});

	test('events close together become one reaction', async () => {
		const { model, state: calls } = fakeModel(say('One'));
		const { repo, loop } = await setup({ key: 'sk-test', model, coalesceMs: 10 });
		await logCompleted(repo);
		loop.reactSoon();
		loop.reactSoon();
		loop.reactSoon();
		await Bun.sleep(60);
		expect((await repo.cards.open())?.text).toBe('One');
		expect(calls.calls).toBe(2); // one reaction: the say round and the closing round
	});

	test('a failing model is logged and does not throw out of the loop', async () => {
		const failing: Model = {
			complete: async () => {
				throw new Error('offline');
			}
		};
		const { repo, loop } = await setup({ key: 'sk-test', model: failing });
		await logCompleted(repo);
		const original = console.error;
		console.error = () => {};
		try {
			await loop.reactNow();
		} finally {
			console.error = original;
		}
		expect((await repo.events.recent(1))[0].outcome).toStartWith('failed');
	});
});
