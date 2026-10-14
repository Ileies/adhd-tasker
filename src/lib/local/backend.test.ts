/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { BackendError } from '#lib/backend.js';
import type { Hint, Model } from '#lib/core/context.js';
import { localBackend } from '#lib/local/backend.js';
import type { ResponseBody } from '#lib/openai.js';
import { Priority } from '#lib/types.js';
import { testCtx } from '#test/ctx.js';

const task = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: Priority.Medium
};

const reply = (text: string): ResponseBody => ({
	output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
	usage: { total_tokens: 5 }
});
const call = (name: string, args: object): ResponseBody => ({
	output: [{ type: 'function_call', call_id: `c-${name}`, name, arguments: JSON.stringify(args) }]
});

async function setup(answers: ResponseBody[] = []) {
	const made = await testCtx();
	const hints: Hint[] = [];
	const planChanges: string[][] = [];
	const model: Model = { complete: async () => answers.shift() ?? reply('Done') };
	const backend = localBackend({
		repo: made.repo,
		now: () => made.state.now,
		hint: (message) => hints.push(message),
		react: () => void made.state.reacts++,
		planChanged: (dates) => planChanges.push(dates),
		modelFor: () => model
	});
	return { ...made, backend, hints, planChanges };
}

const failure = (work: Promise<unknown>) =>
	work.then(
		() => null,
		(error) => error
	);

describe('tasks', () => {
	test('a created task can be loaded by its day and from a day on', async () => {
		const { backend } = await setup();
		const created = await backend.tasks.create(task);
		await backend.tasks.create({ ...task, date: '2026-10-20', title: 'later' });
		expect((await backend.tasks.load('2026-10-14')).map((t) => t.id)).toEqual([created.id]);
		expect(await backend.tasks.since('2026-10-14')).toHaveLength(2);
		expect(await backend.tasks.since('2026-10-15')).toHaveLength(1);
	});

	test('an update and a delete change the stored task', async () => {
		const { backend, repo } = await setup();
		const created = await backend.tasks.create(task);
		await backend.tasks.update({ ...created, title: 'New' });
		expect((await repo.tasks.get(created.id))?.title).toBe('New');
		await backend.tasks.delete(created.id);
		expect(await repo.tasks.get(created.id)).toBeNull();
	});

	test('a refusal is a BackendError with the status and the reason', async () => {
		const { backend } = await setup();
		const error = await failure(backend.tasks.create({ ...task, duration: 0 }));
		expect(error).toBeInstanceOf(BackendError);
		expect(error).toMatchObject({ status: 400 });
		expect(error.message).not.toBe('');
		expect(await failure(backend.tasks.delete(999))).toMatchObject({ status: 404 });
	});

	test('the other tabs hear which days changed', async () => {
		const { backend, planChanges } = await setup();
		const created = await backend.tasks.create(task);
		await backend.tasks.update({ ...created, date: '2026-10-15' });
		await backend.tasks.delete(created.id);
		expect(planChanges).toEqual([['2026-10-14'], ['2026-10-14', '2026-10-15'], ['2026-10-15']]);
	});

	test('an edit asks the agent loop to look at the new event', async () => {
		const { backend, state } = await setup();
		await backend.tasks.create(task);
		expect(state.reacts).toBe(1);
	});
});

describe('schedule', () => {
	test('an alarm is listed, rings through a hint and can be removed', async () => {
		const { backend, hints } = await setup();
		await backend.schedule.addAlarm({
			in_minutes: 10,
			label: 'Stretch',
			tone: 'chime',
			repeat: 'none'
		});
		const listed = await backend.schedule.load();
		expect(listed?.alarms).toMatchObject([{ label: 'Stretch', createdBy: 'user' }]);
		expect(hints).toContainEqual({ type: 'schedule' });
		await backend.schedule.remove(listed!.alarms[0].id);
		expect((await backend.schedule.load())?.alarms).toEqual([]);
	});

	test('a bad alarm says why', async () => {
		const { backend } = await setup();
		const error = await failure(
			backend.schedule.addAlarm({ label: '', tone: 'chime', repeat: 'none', in_minutes: 5 })
		);
		expect(error).toMatchObject({ status: 400 });
	});

	test('a guest has no display device to choose', async () => {
		const { backend, repo } = await setup();
		await backend.schedule.chooseDisplay('abc');
		expect((await repo.settings.get()).displayDevice).toBeNull();
	});
});

describe('assistant', () => {
	test('without a key it says to add one and calls nothing', async () => {
		const { backend } = await setup();
		const error = await failure(backend.assistant.chat([{ role: 'user', content: 'hi' }]));
		expect(error).toMatchObject({ status: 400, message: 'Add your OpenAI key in Settings first' });
	});

	test('a turn with a tool call changes the plan and the change can be undone', async () => {
		const { backend, repo } = await setup([
			call('add_task', {
				title: 'Call dentist',
				date: '2026-10-14',
				start: '14:00',
				duration_minutes: 15
			}),
			reply('Added it.')
		]);
		await repo.settings.update({ openaiKey: 'sk-test' });
		const { reply: text, changes } = await backend.assistant.chat([
			{ role: 'user', content: 'Call the dentist at 14:00' }
		]);
		expect(text).toBe('Added it.');
		expect(changes).toMatchObject([{ summary: expect.stringContaining('Call dentist') }]);
		expect(await repo.tasks.between('2026-10-14', '2026-10-14')).toHaveLength(1);

		const { dates } = await backend.assistant.undo(changes[0].id);
		expect(dates).toEqual(['2026-10-14']);
		expect(await repo.tasks.between('2026-10-14', '2026-10-14')).toEqual([]);
		expect(await failure(backend.assistant.undo(changes[0].id))).toMatchObject({ status: 409 });
	});

	test('a conversation that does not end with the user is refused', async () => {
		const { backend, repo } = await setup();
		await repo.settings.update({ openaiKey: 'sk-test' });
		expect(
			await failure(backend.assistant.chat([{ role: 'assistant', content: 'hello' }]))
		).toMatchObject({ status: 400 });
	});

	test('twenty turns in five minutes are allowed, the next one waits', async () => {
		const { backend, repo } = await setup();
		await repo.settings.update({ openaiKey: 'sk-test' });
		for (let i = 0; i < 20; i++) await backend.assistant.chat([{ role: 'user', content: 'hi' }]);
		expect(await failure(backend.assistant.chat([{ role: 'user', content: 'hi' }]))).toMatchObject({
			status: 429
		});
	});

	test('undo needs a change id', async () => {
		const { backend } = await setup();
		expect(await failure(backend.assistant.undo(1.5))).toMatchObject({ status: 400 });
	});
});

describe('agent', () => {
	test('the feed shows the open card, answering it removes it', async () => {
		const { backend, repo } = await setup();
		const card = await repo.cards.show({ kind: 'say', text: 'Hello', createdAt: 1 });
		expect((await backend.agent.feed(null))?.cards).toMatchObject([{ id: card.id, text: 'Hello' }]);
		await backend.agent.resolveCard(card.id);
		expect((await backend.agent.feed(null))?.cards).toEqual([]);
	});

	test('stuck logs an event for a task and refuses an unknown task', async () => {
		const { backend, repo } = await setup();
		const created = await backend.tasks.create(task);
		await backend.agent.stuck(created.id, 'too-big');
		expect((await repo.events.recent(5)).map((event) => event.type)).toContain('stuck.pressed');
		expect(await failure(backend.agent.stuck(999, 'too-big'))).toMatchObject({ status: 404 });
	});
});

describe('activity', () => {
	test('shows what an edit logged', async () => {
		const { backend } = await setup();
		await backend.tasks.create(task);
		expect((await backend.activity.load()).events).toMatchObject([{ origin: 'user' }]);
	});
});

describe('settings', () => {
	test('loading hides the key and says whether one is saved', async () => {
		const { backend, repo } = await setup();
		await repo.settings.update({ openaiKey: 'sk-secret' });
		const loaded = await backend.settings.load();
		expect(loaded.hasOpenaiKey).toBe(true);
		expect(JSON.stringify(loaded)).not.toContain('sk-secret');
	});

	test('a saved patch is kept, an invalid one is refused with the reason', async () => {
		const { backend } = await setup();
		await backend.settings.save({ showClock: true });
		expect((await backend.settings.load()).showClock).toBe(true);
		expect(await failure(backend.settings.save({ overrunMinutes: 0 }))).toMatchObject({
			status: 400
		});
		expect(await failure(backend.settings.save({}))).toMatchObject({ status: 400 });
	});

	test('the timezone must be a real one', async () => {
		const { backend } = await setup();
		await backend.settings.saveTimezone('Asia/Tokyo');
		expect((await backend.settings.load()).timezone).toBe('Asia/Tokyo');
		expect(await failure(backend.settings.saveTimezone('Mars/Base'))).toMatchObject({
			status: 400
		});
	});
});

describe('voice', () => {
	test('without a key neither transcription nor speech works', async () => {
		const { backend } = await setup();
		expect(
			await failure(backend.voice.transcribe(new Blob(['x'], { type: 'audio/webm' })))
		).toMatchObject({
			status: 400
		});
		expect(await backend.voice.speak('Hello')).toBeNull();
	});
});
