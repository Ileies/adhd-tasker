/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { prune, react, watch } from '#lib/core/agent.js';
import type { Model } from '#lib/core/context.js';
import type { Settings } from '#lib/core/repo.js';
import type { EventType } from '#lib/events.js';
import { LIMITS } from '#lib/guardrails.js';
import type { ResponseBody } from '#lib/openai.js';
import { TaskStatus } from '#lib/types.js';
import { NOW, testCtx } from '#test/ctx.js';
import {
	expectEveryRequestValid,
	failure,
	fakeModel,
	forbiddenModel,
	text,
	toolCalls
} from '#test/fakes.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const DATE = '2026-10-14';
const NIGHT = Date.parse('2026-10-14T23:00:00Z');

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
	errors = spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

type Made = Awaited<ReturnType<typeof testCtx>>;

const logEvent = (
	repo: Made['repo'],
	type: EventType = 'task.completed',
	createdAt = NOW,
	payload: Record<string, unknown> = { title: 'x' }
) => repo.events.insert({ type, payload, origin: 'user', createdAt });

const lastOutcome = async (repo: Made['repo']) => (await repo.events.recent(1))[0].outcome;

/** Runs one reaction with the settings as they are stored right now. */
const run = async ({ ctx, repo }: Made) => react(ctx, await repo.settings.get());

const addTask = (
	repo: Made['repo'],
	fields: Partial<Parameters<Made['repo']['tasks']['insert']>[0]> = {}
) =>
	repo.tasks.insert({
		title: 'Write intro',
		description: '',
		date: DATE,
		startTime: 9 * 60,
		duration: 60,
		priority: 3,
		...fields
	});

/** A model keyed by the stored settings: `act` lets it edit, `suggest` (the default) does not. */
async function acting(model: Model, now = NOW) {
	const made = await testCtx({ model, now });
	await made.repo.settings.update({ aiAutonomy: 'act' });
	return made;
}

describe('react: nothing to do', () => {
	test('without pending events there is no model call', async () => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model });
		await run(made);
		expect(calls).toEqual([]);
	});

	test('events older than ten minutes are dropped, not answered late', async () => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model });
		await logEvent(made.repo, 'task.completed', NOW - LIMITS.staleMs - 1);
		await run(made);
		expect(calls).toEqual([]);
		expect(await lastOutcome(made.repo)).toBe('dropped, too old to react to');
		expect(await made.repo.events.unhandled()).toEqual([]);
	});

	test('an event just inside the window is still answered', async () => {
		const { model, calls } = fakeModel();
		const made = await testCtx({ model });
		await logEvent(made.repo, 'task.completed', NOW - LIMITS.staleMs);
		await run(made);
		expect(calls.length).toBeGreaterThan(0);
	});
});

describe('react: every guardrail keeps the model out', () => {
	const hourOfReactions = (repo: Made['repo'], gapMin: number) =>
		Promise.all(
			Array.from({ length: LIMITS.perHour }, (_, i) =>
				repo.usage.record('reaction', 0, NOW - (gapMin + i) * MIN)
			)
		);

	const cases: [string, string, (made: Made) => Promise<void>, number?][] = [
		[
			'autonomy observe',
			'silent: autonomy is observe',
			async ({ repo }) => void (await repo.settings.update({ aiAutonomy: 'observe' }))
		],
		[
			'the event type is switched off',
			'silent: event type is switched off',
			async ({ repo }) => void (await repo.settings.update({ aiEvents: 'task.missed' }))
		],
		['quiet hours', 'silent: quiet hours', async () => {}, NIGHT],
		[
			'the daily token budget is used up',
			'silent: daily token budget used up',
			async ({ repo }) => {
				await repo.settings.update({ dailyTokenBudget: 1000 });
				await repo.usage.record('chat', 1000, NOW - 1000);
			}
		],
		[
			'six reactions in the last hour',
			'silent: hourly limit reached',
			async ({ repo }) => void (await hourOfReactions(repo, 10))
		],
		[
			'a reaction two minutes ago',
			'silent: too soon after the last reaction',
			({ repo }) => repo.usage.record('reaction', 0, NOW - 2 * MIN)
		]
	];

	test.each(cases)('%s', async (_name, outcome, prepare, now = NOW) => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model, now });
		await prepare(made);
		await logEvent(made.repo, 'task.completed', now);
		await run(made);
		expect(calls).toEqual([]);
		expect(await lastOutcome(made.repo)).toBe(outcome);
		expect(await made.repo.cards.open()).toBeNull();
	});

	test('no key means silence, and the app works without one', async () => {
		const made = await testCtx();
		await logEvent(made.repo);
		await run(made);
		expect(await lastOutcome(made.repo)).toBe('silent: no OpenAI key');
	});

	test('a silenced event is settled, so it is never answered later', async () => {
		const { model } = forbiddenModel();
		const made = await testCtx({ model });
		await made.repo.settings.update({ aiAutonomy: 'observe' });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.events.unhandled()).toEqual([]);
	});

	test('a wakeup is bound by the same rules', async () => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model, now: NIGHT });
		await logEvent(made.repo, 'wakeup.fired', NIGHT, { note: 'check in' });
		await run(made);
		expect(calls).toEqual([]);
		expect(await lastOutcome(made.repo)).toBe('silent: quiet hours');
	});
});

describe('react: I am stuck', () => {
	const exhaust = async ({ repo }: Made) => {
		await repo.settings.update({ dailyTokenBudget: 1000 });
		await repo.usage.record('chat', 1000, NIGHT - 1000);
		await repo.usage.record('reaction', 0, NIGHT - MIN);
	};

	test('is answered in quiet hours with the budget used up and a reaction a minute ago', async () => {
		const { model, calls } = fakeModel();
		const made = await testCtx({ model, now: NIGHT });
		await exhaust(made);
		await logEvent(made.repo, 'stuck.pressed', NIGHT, { reason: 'overwhelmed' });
		await run(made);
		expect(calls.length).toBeGreaterThan(0);
		expect(calls[0].instructions).toContain('pressed "I\'m stuck"');
	});

	test('still stays silent with autonomy observe', async () => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model, now: NIGHT });
		await made.repo.settings.update({ aiAutonomy: 'observe' });
		await logEvent(made.repo, 'stuck.pressed', NIGHT);
		await run(made);
		expect(calls).toEqual([]);
		expect(await lastOutcome(made.repo)).toBe('silent: autonomy is observe');
	});

	test('still obeys the hourly limit', async () => {
		const { model, calls } = forbiddenModel();
		const made = await testCtx({ model, now: NIGHT });
		for (let i = 0; i < LIMITS.perHour; i++)
			await made.repo.usage.record('reaction', 0, NIGHT - (5 + i) * MIN);
		await logEvent(made.repo, 'stuck.pressed', NIGHT);
		await run(made);
		expect(calls).toEqual([]);
		expect(await lastOutcome(made.repo)).toBe('silent: hourly limit reached');
	});
});

describe('react: the request', () => {
	test('is a reaction that follows the fixed OpenAI rules and carries the context', async () => {
		const { model, calls } = fakeModel();
		const made = await testCtx({ model });
		await addTask(made.repo, { title: 'Call dentist' });
		await logEvent(made.repo, 'task.completed', NOW, { title: 'Stretch' });
		await run(made);
		expect(calls[0].use).toBe('reaction');
		expectEveryRequestValid(calls[0]);
		expect(calls[0].instructions).toContain('Call dentist');
		expect(calls[0].instructions).toContain('2026-10-14 09:00 (UTC)');
	});

	test('suggest offers no tool that edits the plan or sets an alarm', async () => {
		const { model, calls } = fakeModel();
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		const names = calls[0].tools!.map((tool) => (tool as unknown as { name: string }).name);
		expect(names).toEqual(expect.arrayContaining(['say', 'ask', 'list_tasks']));
		for (const forbidden of ['add_task', 'update_task', 'delete_task', 'set_alarm'])
			expect(names).not.toContain(forbidden);
	});

	test('act offers the editing tools', async () => {
		const { model, calls } = fakeModel();
		const made = await acting(model);
		await logEvent(made.repo);
		await run(made);
		const names = calls[0].tools!.map((tool) => (tool as unknown as { name: string }).name);
		expect(names).toEqual(expect.arrayContaining(['update_task', 'set_alarm']));
	});
});

describe('react: suggest', () => {
	test('a forged edit call is refused and the task is unchanged', async () => {
		const { model, calls } = fakeModel(
			toolCalls([{ name: 'update_task', arguments: { id: 1, title: 'Hacked', reason: 'x' } }])
		);
		const made = await testCtx({ model });
		const task = await addTask(made.repo);
		await logEvent(made.repo);
		await run(made);
		expect((await made.repo.tasks.get(task.id))?.title).toBe('Write intro');
		expect(await made.repo.actions.recent(5)).toEqual([]);
		const answer = calls[1].input.at(-1) as { output: string };
		expect(JSON.parse(answer.output).error).toContain('may not change the plan');
	});

	test('a forged alarm call is refused too', async () => {
		const { model } = fakeModel(
			toolCalls([{ name: 'set_alarm', arguments: { in_minutes: 10, label: 'x', tone: 'chime' } }])
		);
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.schedule.pending()).toEqual([]);
	});

	test('say shows one card and tells the open screens', async () => {
		const { model } = fakeModel(toolCalls([{ name: 'say', arguments: { text: 'Nice work' } }]));
		const made = await testCtx({ model });
		const event = await logEvent(made.repo);
		await run(made);
		expect(await made.repo.cards.open()).toMatchObject({
			kind: 'say',
			text: 'Nice work',
			eventId: event
		});
		expect(made.hints).toContainEqual({ type: 'agent' });
		expect(await lastOutcome(made.repo)).toBe('reacted: say');
	});

	test('doing nothing is a valid answer', async () => {
		const { model } = fakeModel(text('Nothing to add.'));
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await lastOutcome(made.repo)).toBe('nothing to say');
		expect(await made.repo.cards.open()).toBeNull();
	});
});

describe('react: act', () => {
	test('an edit changes the task, is logged with its event and reason and never wakes the agent', async () => {
		const { model } = fakeModel(
			toolCalls([
				{ name: 'update_task', arguments: { id: 1, title: 'Tidied', reason: 'shorter title' } }
			])
		);
		const made = await acting(model);
		const task = await addTask(made.repo);
		const event = await logEvent(made.repo);
		await run(made);

		expect((await made.repo.tasks.get(task.id))?.title).toBe('Tidied');
		const [action] = await made.repo.actions.recent(1);
		expect(action).toMatchObject({
			tool: 'update_task',
			reason: 'shorter title',
			eventId: event,
			before: { title: 'Write intro' },
			after: { title: 'Tidied' }
		});
		expect(await made.repo.events.unhandled()).toEqual([]);
		expect(made.state.reacts).toBe(0);
		const events = await made.repo.events.recent(5);
		expect(events.find((row) => row.id === event)?.outcome).toBe('reacted: edited the plan');
		expect(events.find((row) => row.origin === 'agent')?.outcome).toBe('caused by the agent');
	});

	test('the agent sets an alarm and plans a wakeup', async () => {
		const { model } = fakeModel(
			toolCalls([
				{ name: 'set_alarm', arguments: { in_minutes: 20, label: 'Stretch', tone: 'chime' } },
				{ name: 'schedule_wakeup', arguments: { in_minutes: 30, note: 'ask how it went' } }
			])
		);
		const made = await acting(model);
		await logEvent(made.repo);
		await run(made);
		const pending = await made.repo.schedule.pending();
		expect(pending.map((entry) => [entry.kind, entry.createdBy])).toEqual([
			['alarm', 'agent'],
			['wakeup', 'agent']
		]);
		expect(await lastOutcome(made.repo)).toBe('reacted: set an alarm, scheduled a wakeup');
	});
});

describe('react: limits per reaction', () => {
	test('at most four tool calls run, the rest are answered with an error', async () => {
		const add = (n: number) => ({
			name: 'add_task',
			arguments: { title: `T${n}`, date: DATE, start: `1${n}:00`, duration_minutes: 30 }
		});
		const { model, calls } = fakeModel(toolCalls([0, 1, 2, 3, 4, 5].map(add)));
		const made = await acting(model);
		await logEvent(made.repo);
		await run(made);

		expect(await made.repo.tasks.between(DATE, DATE)).toHaveLength(LIMITS.maxToolCalls);
		const answers = calls[1].input
			.filter((item) => (item as { type?: string }).type === 'function_call_output')
			.map((item) => JSON.parse((item as { output: string }).output));
		expect(answers).toHaveLength(6);
		expect(answers.slice(4).every((answer) => answer.error.includes('at most 4'))).toBe(true);
	});

	test('the loop ends after a bounded number of rounds even when the model never stops', async () => {
		const endless = toolCalls([{ name: 'list_tasks', arguments: { from: DATE } }]);
		const { model, calls } = fakeModel(...Array.from({ length: 20 }, () => endless));
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(calls).toHaveLength(LIMITS.maxToolCalls + 1);
	});

	test('only one say or ask per reaction', async () => {
		const { model } = fakeModel(
			toolCalls([
				{ name: 'say', arguments: { text: 'First' } },
				{ name: 'ask', arguments: { text: 'Second?', options: ['Yes', 'No'] } }
			])
		);
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.cards.open()).toMatchObject({ kind: 'say', text: 'First' });
	});

	test('an ask keeps its options', async () => {
		const { model } = fakeModel(
			toolCalls([{ name: 'ask', arguments: { text: 'Move it?', options: ['Yes', 'Not now'] } }])
		);
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.cards.open()).toMatchObject({
			kind: 'ask',
			options: ['Yes', 'Not now']
		});
	});

	test('a new card resolves the older open one', async () => {
		const { model } = fakeModel(toolCalls([{ name: 'say', arguments: { text: 'Newer' } }]));
		const made = await testCtx({ model });
		const older = await made.repo.cards.show({ kind: 'say', text: 'Older', createdAt: NOW - MIN });
		await logEvent(made.repo);
		await run(made);
		expect((await made.repo.cards.open())?.text).toBe('Newer');
		expect(await made.repo.cards.resolve(older.id, NOW)).toBe(false);
	});

	test('an invalid say is refused with the reason and shows nothing', async () => {
		const { model, calls } = fakeModel(toolCalls([{ name: 'say', arguments: { text: '' } }]));
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.cards.open()).toBeNull();
		const answer = calls[1].input.at(-1) as { output: string };
		expect(JSON.parse(answer.output).error).toEqual(expect.any(String));
	});
});

describe('react: when the model fails', () => {
	test('the outcome says so, usage is still recorded and no event stays claimed', async () => {
		const { model } = fakeModel(failure());
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await lastOutcome(made.repo)).toBe('failed, the model could not be reached');
		expect(await made.repo.events.unhandled()).toEqual([]);
		expect(await made.repo.usage.countSince('reaction', 0)).toBe(1);
		expect(made.hints).toContainEqual({ type: 'agent' });
	});

	test('a failure counts toward the hourly gap, so an outage is no retry storm', async () => {
		const { model, calls } = fakeModel(failure(), text('late'));
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		made.state.now = NOW + MIN;
		await logEvent(made.repo, 'task.completed', NOW + MIN);
		await run(made);
		expect(calls).toHaveLength(1);
		expect(await lastOutcome(made.repo)).toBe('silent: too soon after the last reaction');
	});

	test('tokens of the rounds that did succeed are recorded', async () => {
		const { model } = fakeModel(
			toolCalls([{ name: 'list_tasks', arguments: { from: DATE } }], 40),
			failure()
		);
		const made = await testCtx({ model });
		await logEvent(made.repo);
		await run(made);
		expect(await made.repo.usage.tokensSince(0)).toBe(40);
	});
});

describe('react: claimed before the call', () => {
	test('a second run while the first waits on the model finds nothing to do', async () => {
		let release!: (answer: ResponseBody) => void;
		let called = 0;
		const model: Model = {
			complete: () => {
				called++;
				return new Promise<ResponseBody>((resolve) => (release = resolve));
			}
		};
		const made = await testCtx({ model });
		await logEvent(made.repo);

		const first = run(made);
		while (called === 0) await Bun.sleep(0);
		await run(made);
		expect(called).toBe(1);

		release({ output: [] });
		await first;
		expect(called).toBe(1);
	});
});

describe('watch', () => {
	const settingsOf = (made: Made) => made.repo.settings.get();
	const events = async (made: Made) => (await made.repo.events.recent(20)).reverse();

	test('the first tick ever stores the current task and reports nothing', async () => {
		const made = await testCtx();
		const task = await addTask(made.repo);
		await watch(made.ctx, await settingsOf(made));
		expect(await events(made)).toEqual([]);
		expect((await settingsOf(made)).lastCurrentTaskId).toBe(task.id);
	});

	test('free time is stored as 0', async () => {
		const made = await testCtx();
		await watch(made.ctx, await settingsOf(made));
		expect((await settingsOf(made)).lastCurrentTaskId).toBe(0);
		expect(await events(made)).toEqual([]);
	});

	test('a switch is logged as a system event and asks the agent to look', async () => {
		const made = await testCtx();
		const task = await addTask(made.repo);
		await watch(made.ctx, await settingsOf(made));
		await made.repo.tasks.update(task.id, { status: TaskStatus.Completed });
		await watch(made.ctx, await settingsOf(made));

		const [event] = await events(made);
		expect(event).toMatchObject({ type: 'task.switched', origin: 'system', handledAt: null });
		expect(made.state.reacts).toBe(1);
		expect((await settingsOf(made)).lastCurrentTaskId).toBe(0);
	});

	test('a switch within a minute of an agent edit counts as the agent and wakes nothing', async () => {
		const made = await testCtx();
		const task = await addTask(made.repo);
		await watch(made.ctx, await settingsOf(made));
		await made.repo.actions.record({
			tool: 'update_task',
			before: task,
			after: { ...task, status: TaskStatus.Completed },
			eventId: null,
			reason: null,
			createdAt: NOW - 30_000
		});
		await made.repo.tasks.update(task.id, { status: TaskStatus.Completed });
		await watch(made.ctx, await settingsOf(made));

		const [event] = await events(made);
		expect(event).toMatchObject({
			type: 'task.switched',
			origin: 'agent',
			outcome: 'caused by the agent'
		});
		expect(made.state.reacts).toBe(0);
	});

	test('an agent edit more than a minute ago does not hide a switch', async () => {
		const made = await testCtx();
		const task = await addTask(made.repo);
		await watch(made.ctx, await settingsOf(made));
		await made.repo.actions.record({
			tool: 'update_task',
			before: task,
			after: task,
			eventId: null,
			reason: null,
			createdAt: NOW - 2 * MIN
		});
		await made.repo.tasks.update(task.id, { status: TaskStatus.Completed });
		await watch(made.ctx, await settingsOf(made));
		expect((await events(made))[0].origin).toBe('system');
	});

	test('a missed task is logged once however many ticks pass', async () => {
		const made = await testCtx();
		await addTask(made.repo, { title: 'Water plants', startTime: 8 * 60 + 40, duration: 10 });
		for (let i = 0; i < 4; i++) {
			made.state.now = NOW + i * 15_000;
			await watch(made.ctx, await settingsOf(made));
		}
		const missed = (await events(made)).filter((event) => event.type === 'task.missed');
		expect(missed).toHaveLength(1);
		expect(missed[0].payload).toMatchObject({ title: 'Water plants' });
	});

	test('a user without a timezone is skipped', async () => {
		const made = await testCtx();
		await addTask(made.repo);
		const settings: Settings = { ...(await settingsOf(made)), timezone: null };
		await watch(made.ctx, settings);
		expect(await events(made)).toEqual([]);
		expect((await settingsOf(made)).lastCurrentTaskId).toBeNull();
	});
});

describe('prune', () => {
	test('removes handled events and usage older than 30 days, keeps unhandled ones', async () => {
		const made = await testCtx();
		const old = NOW - 31 * DAY;
		await made.repo.events.insert({
			type: 'task.completed',
			payload: {},
			origin: 'user',
			createdAt: old,
			handledAt: old,
			outcome: 'old and handled'
		});
		await made.repo.events.insert({
			type: 'task.missed',
			payload: {},
			origin: 'system',
			createdAt: old,
			handledAt: null,
			outcome: null
		});
		await made.repo.usage.record('chat', 50, old);
		await made.repo.usage.record('chat', 7, NOW - DAY);

		await prune(made.ctx);

		const kept = await made.repo.events.recent(10);
		expect(kept.map((event) => event.type)).toEqual(['task.missed']);
		expect(await made.repo.usage.tokensSince(0)).toBe(7);
	});

	test('keeps what is recent', async () => {
		const made = await testCtx();
		await made.repo.events.insert({
			type: 'task.completed',
			payload: {},
			origin: 'user',
			createdAt: NOW - 29 * DAY,
			handledAt: NOW - 29 * DAY,
			outcome: 'recent'
		});
		await prune(made.ctx);
		expect(await made.repo.events.recent(10)).toHaveLength(1);
	});
});
