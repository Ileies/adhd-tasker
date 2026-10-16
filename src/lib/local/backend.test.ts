/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { BackendError } from '#lib/backend.js';
import type { Hint, Model } from '#lib/core/context.js';
import { localBackend } from '#lib/local/backend.js';
import type { ResponseBody } from '#lib/openai.js';
import { Priority, TaskStatus } from '#lib/types.js';
import { GEOCODE_URL } from '#lib/core/geocode.js';
import { testCtx } from '#test/ctx.js';
import { fakeFetch } from '#test/fakes.js';

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

describe('routines', () => {
	const lunch = { title: 'Lunch', startTime: 720, duration: 45, repeat: 'daily' } as const;

	test('a created routine makes its days, is changed and deleted with its tasks', async () => {
		const { backend, hints } = await setup();
		const created = await backend.routines.create(lunch);
		expect(await backend.routines.load()).toMatchObject([{ id: created.id, title: 'Lunch' }]);
		expect(await backend.tasks.since('2026-10-14')).toHaveLength(14);
		await backend.routines.update({ id: created.id, startTime: 750 });
		expect((await backend.tasks.load('2026-10-15'))[0].startTime).toBe(750);
		expect(await backend.routines.delete(created.id)).toMatchObject({ id: created.id });
		expect(await backend.routines.load()).toEqual([]);
		expect(await backend.tasks.since('2026-10-14')).toEqual([]);
		expect(hints.filter((hint) => hint.type === 'routines').length).toBeGreaterThanOrEqual(3);
	});

	test('a refusal is a BackendError with the status', async () => {
		const { backend } = await setup();
		expect(await failure(backend.routines.create({ ...lunch, repeat: 'none' }))).toMatchObject({
			status: 400
		});
		expect(await failure(backend.routines.delete(999))).toMatchObject({ status: 404 });
		expect(await failure(backend.routines.update({ id: 999, title: 'x' }))).toBeInstanceOf(
			BackendError
		);
	});
});

describe('to-dos and the flow log', () => {
	test('a created to-do is listed, changed and deleted', async () => {
		const { backend, hints } = await setup();
		const created = await backend.todos.create({ title: 'Taxes', estimate: 60 });
		expect(await backend.todos.load()).toMatchObject([{ id: created.id, estimate: 60 }]);
		expect(await backend.todos.update({ id: created.id, status: 'done' })).toMatchObject({
			status: 'done',
			progress: 100
		});
		await backend.todos.delete(created.id);
		expect(await backend.todos.load()).toEqual([]);
		expect(hints.filter((hint) => hint.type === 'todos')).toHaveLength(3);
	});

	test('a refusal is a BackendError with the status', async () => {
		const { backend } = await setup();
		expect(await failure(backend.todos.create({ title: '' }))).toMatchObject({ status: 400 });
		expect(await failure(backend.todos.delete(999))).toMatchObject({ status: 404 });
		expect(await failure(backend.flow.record({ type: 'pin' }))).toBeInstanceOf(BackendError);
	});

	test('an answer is logged under today and loaded by its day', async () => {
		const { backend } = await setup();
		await backend.flow.record({ type: 'start', todoId: 1 });
		expect(await backend.flow.load('2026-10-14')).toMatchObject([{ type: 'start', todoId: 1 }]);
		expect(await backend.flow.load('2026-10-13')).toEqual([]);
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

describe('alarm switch', () => {
	test('turns a clock alarm off and on and rejects an unknown id', async () => {
		const { backend } = await setup();
		await backend.schedule.addAlarm({ label: 'Meds', tone: 'chime', repeat: 'daily', at: '09:30' });
		const [meds] = (await backend.schedule.load())!.alarms;
		await backend.schedule.setEnabled(meds.id, false);
		expect((await backend.schedule.load())!.alarms[0].enabled).toBe(false);
		await backend.schedule.setEnabled(meds.id, true);
		expect((await backend.schedule.load())!.alarms[0].enabled).toBe(true);
		expect(await failure(backend.schedule.setEnabled(999, false))).toMatchObject({
			message: 'No such alarm'
		});
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

	describe('suggested steps', () => {
		const answer = call('suggest_steps', { steps: [{ title: 'Pack ID', minutes: 5 }] });
		const appointment = (repo: Awaited<ReturnType<typeof setup>>['repo']) =>
			repo.tasks.insert({ ...task, kind: 'appointment' });

		test('come from the device own call and are not written', async () => {
			const { backend, repo } = await setup([answer]);
			await repo.settings.update({ openaiKey: 'sk-test' });
			const exam = await appointment(repo);
			expect(await backend.assistant.suggestPrep(exam.id)).toEqual({
				steps: [{ title: 'Pack ID', minutes: 5 }]
			});
			expect(await repo.todos.all()).toEqual([]);
		});

		test('without a key the device says to add one', async () => {
			const { backend, repo } = await setup([answer]);
			const exam = await appointment(repo);
			expect(await failure(backend.assistant.suggestPrep(exam.id))).toMatchObject({
				status: 400,
				message: 'Add your OpenAI key in Settings first'
			});
		});

		test('ten in five minutes are allowed, the next one waits', async () => {
			const { backend, repo } = await setup(Array.from({ length: 10 }, () => answer));
			await repo.settings.update({ openaiKey: 'sk-test' });
			const exam = await appointment(repo);
			for (let i = 0; i < 10; i++) await backend.assistant.suggestPrep(exam.id);
			expect(await failure(backend.assistant.suggestPrep(exam.id))).toMatchObject({ status: 429 });
		});
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
		await backend.agent.stuck({ taskId: created.id }, 'too-big');
		expect((await repo.events.recent(5)).map((event) => event.type)).toContain('stuck.pressed');
		expect(await failure(backend.agent.stuck({ taskId: 999 }, 'too-big'))).toMatchObject({
			status: 404
		});
	});

	test('stuck on a to-do names the to-do and refuses an unknown one', async () => {
		const { backend, repo } = await setup();
		const todo = await backend.todos.create({ title: 'Study B' });
		await backend.agent.stuck({ todoId: todo.id }, 'too-big');
		expect((await repo.events.recent(1))[0]).toMatchObject({
			type: 'stuck.pressed',
			payload: { todoId: todo.id, title: 'Study B', reasonId: 'too-big' }
		});
		expect(await failure(backend.agent.stuck({ todoId: 999 }, 'too-big'))).toMatchObject({
			status: 404
		});
	});
});

describe('data', () => {
	test('an export of the device imports into another device with the same plan', async () => {
		const source = await setup();
		await source.backend.tasks.create(task);
		await source.backend.settings.save({ showClock: true });
		const file = JSON.parse(JSON.stringify(await source.backend.data.export()));

		const target = await setup();
		expect(await target.backend.data.import(file)).toEqual({
			tasks: 1,
			skipped: 0,
			alarms: 0,
			todos: 0
		});
		expect((await target.backend.tasks.load('2026-10-14')).map((t) => t.title)).toEqual([
			'Write intro'
		]);
		expect((await target.backend.settings.load()).showClock).toBe(true);
	});

	test('an import tells the other tabs which days changed and that alarms may have', async () => {
		const { backend, planChanges, hints } = await setup();
		await backend.data.import({
			app: 'adhd-tasker',
			version: 1,
			settings: {},
			tasks: [task, { ...task, date: '2026-10-15', startTime: 600 }],
			alarms: [
				{
					fireAt: 4_000_000_000_000,
					minutes: null,
					repeat: 'none',
					label: 'a',
					tone: 'chime',
					durationMin: 5
				}
			]
		});
		expect(planChanges).toEqual([['2026-10-14', '2026-10-15']]);
		expect(hints).toContainEqual({ type: 'schedule' });
	});

	test('a file that is not an export is refused with the reason', async () => {
		const { backend } = await setup();
		const error = await failure(backend.data.import({ hello: 'world' }));
		expect(error).toBeInstanceOf(BackendError);
		expect(error).toMatchObject({ status: 400, message: 'This is not an ADHD Tasker export file' });
	});

	test('the first saved task asks the browser to keep the data, once', async () => {
		const made = await testCtx();
		let asked = 0;
		const backend = localBackend({
			repo: made.repo,
			hint: () => 1,
			react: () => {},
			persist: () => void asked++
		});
		await backend.tasks.create(task);
		await backend.tasks.create({ ...task, startTime: 700 });
		expect(asked).toBe(1);
	});

	test('erase deletes through the runtime, and says so when there is nothing to delete', async () => {
		const made = await testCtx();
		let erased = 0;
		const withErase = localBackend({
			repo: made.repo,
			hint: () => 1,
			react: () => {},
			erase: async () => void erased++
		});
		await withErase.data.erase();
		expect(erased).toBe(1);
		const without = localBackend({ repo: made.repo, hint: () => 1, react: () => {} });
		expect(await failure(without.data.erase())).toMatchObject({ status: 400 });
	});
});

describe('calendar', () => {
	test('a device has no calendar to link, reads nothing and asks to sign in for the rest', async () => {
		const { backend } = await setup();
		expect(await backend.calendar.overview()).toMatchObject({ linked: false, calendars: [] });
		expect(await backend.calendar.sync()).toBe(false);
		expect(await backend.calendar.allDay('2026-10-14', '2026-10-15')).toEqual([]);
		await backend.calendar.stop();
		for (const attempt of [
			() => backend.calendar.preview(['primary']),
			() => backend.calendar.import('all'),
			() => backend.calendar.setWrite('primary')
		])
			expect(await attempt().catch((error) => error)).toMatchObject({ status: 401 });
	});
});

describe('account', () => {
	test('a device has no account to move into and no snapshots to restore, it says to sign in', async () => {
		const { backend } = await setup();
		expect(await backend.account.snapshots()).toEqual([]);
		for (const attempt of [
			() => backend.account.move({} as never, 'both', '2026-10-14'),
			() => backend.account.restore(1)
		])
			expect(await attempt().catch((error) => error)).toMatchObject({
				status: 401,
				message: 'Sign in first'
			});
	});
});

describe('sample day', () => {
	test('starting adds the sample tasks, marks them and tells the other tabs', async () => {
		const { backend, planChanges } = await setup();
		const created = await backend.sample.start('2026-10-14', 12 * 60);
		expect(created.length).toBeGreaterThanOrEqual(100);
		expect((await backend.sample.ids()).sort()).toEqual(created.map((t) => t.id).sort());
		expect(await backend.tasks.load('2026-10-14')).not.toHaveLength(0);
		expect(planChanges).toHaveLength(1);
		expect(planChanges[0]).toContain('2026-10-14');
	});

	test('starting again adds nothing', async () => {
		const { backend } = await setup();
		const first = await backend.sample.start('2026-10-14', 12 * 60);
		const second = await backend.sample.start('2026-10-14', 12 * 60);
		expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
		expect(await backend.tasks.since('2000-01-01')).toHaveLength(first.length);
	});

	test('clearing removes exactly the sample tasks and leaves the tasks the user planned', async () => {
		const { backend } = await setup();
		const mine = await backend.tasks.create({ ...task, title: 'Mine' });
		await backend.sample.start('2026-10-14', 12 * 60);
		const removed = await backend.sample.clear();
		expect(removed).toBeGreaterThanOrEqual(100);
		expect((await backend.tasks.since('2000-01-01')).map((t) => t.id)).toEqual([mine.id]);
		expect(await backend.sample.ids()).toEqual([]);
	});

	test('keeping unmarks the sample and leaves every task in the plan', async () => {
		const { backend } = await setup();
		const created = await backend.sample.start('2026-10-14', 12 * 60);
		await backend.sample.keep();
		expect(await backend.sample.ids()).toEqual([]);
		expect(await backend.sample.clear()).toBe(0);
		expect(await backend.tasks.since('2000-01-01')).toHaveLength(created.length);
	});

	test('a sample task the user already deleted is no longer counted', async () => {
		const { backend } = await setup();
		const [first, ...rest] = await backend.sample.start('2026-10-14', 12 * 60);
		await backend.tasks.delete(first.id);
		expect((await backend.sample.ids()).sort()).toEqual(rest.map((t) => t.id).sort());
		expect(await backend.sample.clear()).toBe(rest.length);
	});

	test('does not log an event, so the agent is not woken for tasks the user did not plan', async () => {
		const { backend } = await setup();
		await backend.sample.start('2026-10-14', 12 * 60);
		expect((await backend.activity.load()).events).toEqual([]);
	});

	test('the essentials are daily routines that made the next 14 days, meals may move', async () => {
		const { backend } = await setup();
		await backend.sample.start('2026-10-14', 12 * 60);
		const routines = await backend.routines.load();
		expect(routines.map((routine) => routine.title)).toEqual([
			'Meds',
			'Breakfast',
			'Lunch',
			'Dinner',
			'Go to bed'
		]);
		expect(routines.find((routine) => routine.title === 'Lunch')).toMatchObject({
			repeat: 'daily',
			startTime: 12 * 60,
			shift: 60
		});
		const lunches = (await backend.tasks.since('2026-10-14')).filter(
			(task) => task.title === 'Lunch'
		);
		expect(lunches).toHaveLength(14);
	});

	test('what ended before now today is done, also for the routines', async () => {
		const { backend } = await setup();
		await backend.sample.start('2026-10-14', 12 * 60 + 8);
		const today = await backend.tasks.load('2026-10-14');
		const status = (title: string) => today.find((task) => task.title === title)?.status;
		expect(status('Breakfast')).toBe(TaskStatus.Completed);
		expect(status('Lunch')).toBe(TaskStatus.Pending);
		expect(status('Dinner')).toBe(TaskStatus.Pending);
	});

	test('a day a routine makes later is part of the sample and goes with it', async () => {
		const { backend, repo } = await setup();
		const created = await backend.sample.start('2026-10-14', 12 * 60);
		const [lunch] = (await backend.routines.load()).filter((routine) => routine.title === 'Lunch');
		const later = await repo.tasks.insert({
			title: 'Lunch',
			description: '',
			date: '2026-11-20',
			startTime: 12 * 60,
			duration: 45,
			priority: 5,
			status: TaskStatus.Pending,
			routineId: lunch.id
		});
		expect(await backend.sample.ids()).toContain(later.id);
		expect(await backend.sample.clear()).toBe(created.length + 1);
		expect(await backend.routines.load()).toEqual([]);
		expect(await backend.tasks.since('2000-01-01')).toEqual([]);
	});

	test('keeping makes the routines the user own, clearing then removes nothing', async () => {
		const { backend } = await setup();
		const created = await backend.sample.start('2026-10-14', 12 * 60);
		await backend.sample.keep();
		expect(await backend.sample.clear()).toBe(0);
		expect(await backend.routines.load()).toHaveLength(5);
		expect(await backend.tasks.since('2000-01-01')).toHaveLength(created.length);
	});

	test('clearing leaves a routine the user made themselves', async () => {
		const { backend } = await setup();
		const mine = await backend.routines.create({
			title: 'Water plants',
			startTime: 9 * 60,
			duration: 15,
			repeat: 'weekdays'
		});
		await backend.sample.start('2026-10-14', 12 * 60);
		await backend.sample.clear();
		expect((await backend.routines.load()).map((routine) => routine.id)).toEqual([mine.id]);
		expect(
			(await backend.tasks.since('2000-01-01')).every((task) => task.routineId === mine.id)
		).toBe(true);
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

describe('city search', () => {
	test('a guest searches from the browser and gets places back', async () => {
		fakeFetch({
			[GEOCODE_URL]: () =>
				Response.json({
					results: [{ name: 'Leipzig', latitude: 51.34, longitude: 12.37, country: 'Germany' }]
				})
		});
		const { backend } = await setup();
		expect(await backend.settings.searchPlaces('Leipzig')).toEqual([
			{ name: 'Leipzig, Germany', lat: 51.34, lon: 12.37 }
		]);
	});

	test('a name that is too short is refused with the reason', async () => {
		const { backend } = await setup();
		expect(await failure(backend.settings.searchPlaces('L'))).toMatchObject({ status: 400 });
	});

	test('a search service that fails is a bad gateway', async () => {
		fakeFetch({ [GEOCODE_URL]: () => new Response('no', { status: 500 }) });
		const { backend } = await setup();
		expect(await failure(backend.settings.searchPlaces('Leipzig'))).toMatchObject({ status: 502 });
	});

	test('a saved location is kept on the device', async () => {
		const { backend } = await setup();
		const place = {
			locationLat: 51.34,
			locationLon: 12.37,
			locationName: 'Leipzig',
			locationSource: 'city'
		} as const;
		await backend.settings.save(place);
		expect(await backend.settings.load()).toMatchObject(place);
		expect(await failure(backend.settings.save({ locationLat: 51.34 }))).toMatchObject({
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
