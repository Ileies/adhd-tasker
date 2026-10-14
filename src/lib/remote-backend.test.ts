/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { BackendError } from '#lib/backend.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { fakeFetch } from '#test/fakes.js';

const json =
	(body: unknown, status = 200) =>
	() =>
		Response.json(body, { status });
const refuse = (status: number, message?: string) =>
	json(message === undefined ? {} : { message }, status);
const lost = () => {
	throw new Error('offline');
};

const failure = (run: () => Promise<unknown>) =>
	run().then(
		() => null,
		(error) => error
	);

describe('remoteBackend errors', () => {
	test('a refusal carries the status and the reason the server gave', async () => {
		fakeFetch({ 'http://localhost:5173/edit': refuse(400, 'title is required') });
		const error = await failure(() => remoteBackend.tasks.load('2026-10-14'));
		expect(error).toBeInstanceOf(BackendError);
		expect(error).toMatchObject({ status: 400, message: 'title is required' });
	});

	test('a refusal without a reason says the status', async () => {
		fakeFetch({ 'http://localhost:5173/edit': refuse(503) });
		expect(await failure(() => remoteBackend.tasks.delete(1))).toMatchObject({
			status: 503,
			message: 'error 503'
		});
	});

	test('a lost connection has no status', async () => {
		fakeFetch({ 'http://localhost:5173/edit': lost });
		expect(await failure(() => remoteBackend.tasks.delete(1))).toMatchObject({
			status: null,
			message: 'Could not reach the server.'
		});
	});

	test('the chat falls back to its own sentence when the server gave no reason', async () => {
		fakeFetch({ 'http://localhost:5173/assistant': refuse(500) });
		expect((await failure(() => remoteBackend.assistant.chat([]))).message).toBe(
			'The assistant is not available right now.'
		);
	});

	test('a failed undo keeps its status, so Already undone can be told apart', async () => {
		fakeFetch({ 'http://localhost:5173/assistant/undo': refuse(409, 'Already undone') });
		expect(await failure(() => remoteBackend.assistant.undo(3))).toMatchObject({ status: 409 });
	});
});

describe('remoteBackend requests', () => {
	test('tasks: one day is a GET with the date, a change is JSON to /edit', async () => {
		const { requests } = fakeFetch({
			'GET http://localhost:5173/edit': json([{ id: 1 }]),
			'POST http://localhost:5173/edit': json({ id: 2 }),
			'PUT http://localhost:5173/edit': json(true),
			'DELETE http://localhost:5173/edit': json(true)
		});
		expect<unknown>(await remoteBackend.tasks.load('2026-10-14')).toEqual([{ id: 1 }]);
		expect(new URL(requests[0].url).search).toBe('?date=2026-10-14');
		expect<unknown>(await remoteBackend.tasks.create({ title: 'a' } as never)).toEqual({ id: 2 });
		await remoteBackend.tasks.update({ id: 2, title: 'b' } as never);
		await remoteBackend.tasks.delete(2);
		expect(await requests[1].json()).toEqual({ title: 'a' });
		expect(await requests[2].json()).toEqual({ id: 2, title: 'b' });
		expect(await requests[3].json()).toEqual({ id: 2 });
	});

	test('schedule: a refused listing is null, an alarm error carries the reason', async () => {
		fakeFetch({
			'GET http://localhost:5173/schedule': refuse(500),
			'POST http://localhost:5173/schedule': refuse(400, 'At most 30 alarms')
		});
		expect<unknown>(await remoteBackend.schedule.load()).toBeNull();
		expect(
			(await failure(() => remoteBackend.schedule.addAlarm({ label: 'x' } as never))).message
		).toBe('At most 30 alarms');
	});

	test('schedule: a listing gives alarms and wakeups', async () => {
		fakeFetch({
			'GET http://localhost:5173/schedule': json({ alarms: [{ id: 1 }], wakeups: [], extra: 1 })
		});
		expect<unknown>(await remoteBackend.schedule.load()).toEqual({
			alarms: [{ id: 1 }],
			wakeups: []
		});
	});

	test('schedule: cancelling and choosing the display device hit their routes', async () => {
		const { requests } = fakeFetch({
			'DELETE http://localhost:5173/schedule/4': () => new Response(null, { status: 204 }),
			'POST http://localhost:5173/schedule/display': () => new Response(null, { status: 204 })
		});
		await remoteBackend.schedule.remove(4);
		await remoteBackend.schedule.chooseDisplay(null);
		expect(await requests[1].json()).toEqual({ device: null });
	});

	test('agent: the feed asks with the cursor, a refusal is null', async () => {
		const { requests } = fakeFetch({
			'GET http://localhost:5173/agent': (request) =>
				new URL(request.url).search === '?since=7' ? json({ cursor: 8 })() : refuse(500)()
		});
		expect<unknown>(await remoteBackend.agent.feed(7)).toEqual({ cursor: 8 });
		expect<unknown>(await remoteBackend.agent.feed(null)).toBeNull();
		expect(new URL(requests[1].url).search).toBe('');
	});

	test('agent: answering a card and reporting stuck go to their routes', async () => {
		const { requests } = fakeFetch({
			'POST http://localhost:5173/agent/cards/5': json({ ok: true }),
			'POST http://localhost:5173/agent/stuck': json({ ok: true })
		});
		await remoteBackend.agent.resolveCard(5);
		await remoteBackend.agent.stuck(9, 'Do not know where to start');
		expect(await requests[1].json()).toEqual({ taskId: 9, reason: 'Do not know where to start' });
	});

	test('settings: a changed setting is a PUT of just that patch', async () => {
		const { requests } = fakeFetch({ 'PUT http://localhost:5173/settings': json(true) });
		await remoteBackend.settings.save({ showClock: true });
		expect(await requests[0].json()).toEqual({ showClock: true });
	});

	test('settings: the timezone is a PUT', async () => {
		const { requests } = fakeFetch({ 'PUT http://localhost:5173/settings/timezone': json(true) });
		await remoteBackend.settings.saveTimezone('Asia/Tokyo');
		expect(await requests[0].json()).toEqual({ timezone: 'Asia/Tokyo' });
	});

	test('voice: transcription returns trimmed text, a failure says why', async () => {
		fakeFetch({ 'POST http://localhost:5173/assistant/transcribe': json({ text: ' hello ' }) });
		expect(await remoteBackend.voice.transcribe(new Blob(['x'], { type: 'audio/webm' }))).toBe(
			'hello'
		);
		fakeFetch({ 'POST http://localhost:5173/assistant/transcribe': refuse(500) });
		expect((await failure(() => remoteBackend.voice.transcribe(new Blob(['x'])))).message).toBe(
			'Could not understand the recording'
		);
	});

	test('voice: speech is a blob, a refusal is null', async () => {
		fakeFetch({
			'POST http://localhost:5173/assistant/speak': () =>
				new Response('wav', { headers: { 'Content-Type': 'audio/wav' } })
		});
		expect(await (await remoteBackend.voice.speak('hi'))!.text()).toBe('wav');
		fakeFetch({ 'POST http://localhost:5173/assistant/speak': refuse(502) });
		expect(await remoteBackend.voice.speak('hi')).toBeNull();
	});
});
