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

	test('settings: loading gives the settings the server sent', async () => {
		fakeFetch({
			'GET http://localhost:5173/settings': json({ showClock: true, hasOpenaiKey: false })
		});
		expect(await remoteBackend.settings.load()).toMatchObject({
			showClock: true,
			hasOpenaiKey: false
		});
	});

	test('data: the export is a GET, an import a POST of the file with the result back', async () => {
		const { requests } = fakeFetch({
			'GET http://localhost:5173/export': json({ app: 'adhd-tasker', tasks: [] }),
			'POST http://localhost:5173/import': json({ tasks: 2, skipped: 0, alarms: 0 })
		});
		expect(await remoteBackend.data.export()).toMatchObject({ app: 'adhd-tasker' });
		expect(await remoteBackend.data.import({ app: 'adhd-tasker' })).toEqual({
			tasks: 2,
			skipped: 0,
			alarms: 0
		});
		expect(await requests[1].json()).toEqual({ app: 'adhd-tasker' });
	});

	test('data: a refused import carries the reason', async () => {
		fakeFetch({
			'POST http://localhost:5173/import': refuse(400, 'This is not an ADHD Tasker export file')
		});
		expect(await failure(() => remoteBackend.data.import({}))).toMatchObject({
			status: 400,
			message: 'This is not an ADHD Tasker export file'
		});
	});

	test('data: erasing is a DELETE of the account, a refusal carries the reason', async () => {
		const { requests } = fakeFetch({
			'DELETE http://localhost:5173/account': () => new Response(null, { status: 204 })
		});
		await remoteBackend.data.erase();
		expect(requests[0].method).toBe('DELETE');

		fakeFetch({ 'DELETE http://localhost:5173/account': refuse(401, 'Login required') });
		expect(await failure(() => remoteBackend.data.erase())).toMatchObject({
			status: 401,
			message: 'Login required'
		});
	});

	test('account: a move is a POST of the file, the mode and the day, with the result back', async () => {
		const { requests } = fakeFetch({
			'POST http://localhost:5173/account/import': json({
				tasks: 2,
				skipped: 0,
				alarms: 0,
				snapshotId: 4
			})
		});
		const file = { app: 'adhd-tasker' } as never;
		expect(await remoteBackend.account.move(file, 'both', '2026-10-14')).toMatchObject({
			snapshotId: 4
		});
		expect(await requests[0].json()).toEqual({ file, mode: 'both', today: '2026-10-14' });
	});

	test('account: a refused move carries the reason', async () => {
		fakeFetch({
			'POST http://localhost:5173/account/import': refuse(400, 'Task 2 is not valid: bad')
		});
		expect(
			await failure(() => remoteBackend.account.move({} as never, 'replace', '2026-10-14'))
		).toMatchObject({ status: 400, message: 'Task 2 is not valid: bad' });
	});

	test('account: snapshots are a GET, a restore a POST of the id', async () => {
		const { requests } = fakeFetch({
			'GET http://localhost:5173/account/snapshots': json([
				{ id: 3, createdAt: 1, tasks: 4, alarms: 0 }
			]),
			'POST http://localhost:5173/account/restore': json({
				tasks: 4,
				skipped: 0,
				alarms: 0,
				snapshotId: 5
			})
		});
		expect(await remoteBackend.account.snapshots()).toEqual([
			{ id: 3, createdAt: 1, tasks: 4, alarms: 0 }
		]);
		expect(await remoteBackend.account.restore(3)).toMatchObject({ snapshotId: 5 });
		expect(await requests[1].json()).toEqual({ id: 3 });
	});

	test('calendar: overview is a GET, preview and import POST their choice', async () => {
		const { requests } = fakeFetch({
			'GET http://localhost:5173/calendar': json({
				linked: true,
				state: { status: 'none' },
				calendars: []
			}),
			'POST http://localhost:5173/calendar/preview': json({ events: 2 }),
			'POST http://localhost:5173/calendar/import': json({ tasks: 1, left: 0, allDay: 0 })
		});
		expect(await remoteBackend.calendar.overview()).toMatchObject({ linked: true });
		expect(await remoteBackend.calendar.preview(['primary'])).toMatchObject({ events: 2 });
		expect(await remoteBackend.calendar.import('noClash')).toMatchObject({ tasks: 1 });
		expect(await requests[1].json()).toEqual({ calendars: ['primary'] });
		expect(await requests[2].json()).toEqual({ mode: 'noClash' });
	});

	test('calendar: sync answers whether the plan changed, stop is a DELETE', async () => {
		const { requests } = fakeFetch({
			'POST http://localhost:5173/calendar/sync': json({ changed: true }),
			'DELETE http://localhost:5173/calendar': () => new Response(null, { status: 204 })
		});
		expect(await remoteBackend.calendar.sync()).toBe(true);
		await remoteBackend.calendar.stop();
		expect(requests[1].method).toBe('DELETE');
	});

	test('calendar: a refused import says why, a failed all-day read leaves the line out', async () => {
		fakeFetch({
			'POST http://localhost:5173/calendar/import': refuse(409, 'Look at the preview first'),
			'GET http://localhost:5173/calendar/all-day': refuse(500)
		});
		expect(await failure(() => remoteBackend.calendar.import('all'))).toMatchObject({
			status: 409,
			message: 'Look at the preview first'
		});
		expect(await remoteBackend.calendar.allDay('2026-10-14', '2026-10-15')).toEqual([]);
	});

	test('activity: the view is a GET of /activity', async () => {
		fakeFetch({ 'GET http://localhost:5173/activity': json({ tokensToday: 3 }) });
		expect(await remoteBackend.activity.load()).toMatchObject({ tokensToday: 3 });
	});

	test('tasks: everything from one day on is a GET with from', async () => {
		const { requests } = fakeFetch({ 'GET http://localhost:5173/edit': json([{ id: 1 }]) });
		expect(await remoteBackend.tasks.since('2026-10-13')).toMatchObject([{ id: 1 }]);
		expect(new URL(requests[0].url).search).toBe('?from=2026-10-13');
	});

	test('settings: the key is a PUT of just the key, removing it a DELETE', async () => {
		const { requests } = fakeFetch({
			'PUT http://localhost:5173/settings/openai-key': json(true),
			'DELETE http://localhost:5173/settings/openai-key': json(true)
		});
		await remoteBackend.settings.saveKey('sk-x');
		await remoteBackend.settings.removeKey();
		expect(await requests[0].json()).toEqual({ key: 'sk-x' });
		expect(requests[1].method).toBe('DELETE');
	});

	test('settings: a refused key carries the reason', async () => {
		fakeFetch({
			'PUT http://localhost:5173/settings/openai-key': refuse(400, 'OpenAI did not accept this key')
		});
		expect(await failure(() => remoteBackend.settings.saveKey('sk-bad'))).toMatchObject({
			status: 400,
			message: 'OpenAI did not accept this key'
		});
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

describe('remoteBackend sample day', () => {
	test('an account has no sample tasks and cannot start one', async () => {
		expect(await remoteBackend.sample.ids()).toEqual([]);
		expect(await remoteBackend.sample.clear()).toBe(0);
		expect(await failure(() => remoteBackend.sample.start('2026-10-14', 720))).toMatchObject({
			status: 501
		});
	});
});
