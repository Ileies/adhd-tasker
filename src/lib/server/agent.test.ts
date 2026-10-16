/// <reference types="bun" />
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	setSystemTime,
	spyOn,
	test
} from 'bun:test';
import { LIMITS } from '#lib/guardrails.js';
import { OPENAI_URL } from '#lib/openai.js';
import { startAgent, tick } from '#lib/server/agent.js';
import { OPENAI_KEY_PURPOSE, serverCtx, setReactor } from '#lib/server/ctx.js';
import { encrypt } from '#lib/server/crypto.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { TaskStatus } from '#lib/types.js';
import { resetDb } from '#test/db.js';
import { fakeFetch, text } from '#test/fakes.js';
import { TEST_DATE, TEST_EMAIL, makeTask, makeUser } from '#test/fixtures.js';

const MIN = 60_000;
/** 11:00 in Berlin, where the fixtures' user lives. */
const NOW = Date.parse('2026-10-14T09:00:00Z');
const route = `POST ${OPENAI_URL}`;
const sealed = (key: string) => encrypt(key, 'test-secret', OPENAI_KEY_PURPOSE);

let errors: ReturnType<typeof spyOn>;
beforeEach(async () => {
	await resetDb();
	setSystemTime(new Date(NOW));
	errors = spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	errors.mockRestore();
	const state = globalThis as { __taskerAgent?: ReturnType<typeof setInterval> };
	if (state.__taskerAgent) clearInterval(state.__taskerAgent);
	setReactor(() => {});
});

const current = (overrides = {}) =>
	makeTask({
		title: 'Write intro',
		date: TEST_DATE,
		startTime: 10 * 60 + 30,
		duration: 60,
		...overrides
	});

describe('tick', () => {
	test('rings what is due for every account', async () => {
		await makeUser();
		const heard: StreamMessage[] = [];
		const off = subscribe(TEST_EMAIL, null, (message) => heard.push(message));
		await dbRepo(TEST_EMAIL).schedule.insert({
			kind: 'alarm',
			fireAt: NOW - MIN,
			label: 'Stretch',
			createdBy: 'user',
			createdAt: NOW - 10 * MIN
		});
		await tick();
		off();
		expect(heard.map((message) => message.type)).toEqual(['alarm', 'schedule']);
	});

	test('watches every account: the first sighting is quiet, a later switch is logged', async () => {
		const task = await current();
		await tick();
		expect((await dbRepo(TEST_EMAIL).settings.get()).lastCurrentTaskId).toBe(task.id);
		expect(await dbRepo(TEST_EMAIL).events.recent(5)).toEqual([]);

		await dbRepo(TEST_EMAIL).tasks.update(task.id, { status: TaskStatus.Completed });
		await tick();
		expect((await dbRepo(TEST_EMAIL).events.recent(5)).map((event) => event.type)).toContain(
			'task.switched'
		);
	});

	test('one account failing does not stop the others', async () => {
		await makeUser({ email: 'broken@example.com', timezone: 'Not/AZone' });
		const task = await current();
		await tick();
		expect((await dbRepo(TEST_EMAIL).settings.get()).lastCurrentTaskId).toBe(task.id);
	});

	describe('the safety net for events nobody is waiting on', () => {
		const left = async (age: number) => {
			await makeUser({ openaiKey: sealed('sk-saved') });
			await dbRepo(TEST_EMAIL).events.insert({
				type: 'task.completed',
				payload: { title: 'x' },
				origin: 'user',
				createdAt: NOW - age
			});
		};

		test('an event left behind, for example by a restart, is answered', async () => {
			await left(LIMITS.coalesceMs * 2 + 1000);
			const { requests } = fakeFetch({ [route]: () => Response.json(text('Nothing to add.')) });
			await tick();
			expect(requests).toHaveLength(1);
			expect(await dbRepo(TEST_EMAIL).events.unhandled()).toEqual([]);
		});

		test('a fresh event is left for the coalescing timer', async () => {
			await left(1000);
			const { requests } = fakeFetch({ [route]: () => Response.json(text('x')) });
			await tick();
			expect(requests).toEqual([]);
			expect(await dbRepo(TEST_EMAIL).events.unhandled()).toHaveLength(1);
		});

		test('without a key the leftover event is settled as silent', async () => {
			await makeUser();
			await dbRepo(TEST_EMAIL).events.insert({
				type: 'task.completed',
				payload: {},
				origin: 'user',
				createdAt: NOW - 60_000
			});
			fakeFetch({});
			await tick();
			expect((await dbRepo(TEST_EMAIL).events.recent(1))[0].outcome).toBe('silent: no OpenAI key');
		});
	});

	test('prunes old rows once an hour, not on every tick', async () => {
		await makeUser();
		// Far later than any other test of this file, the last prune is module state
		const later = NOW + 100 * 86_400_000;
		const oldRow = (at: number, outcome: string) =>
			dbRepo(TEST_EMAIL).events.insert({
				type: 'task.completed',
				payload: {},
				origin: 'user',
				createdAt: at - 40 * 86_400_000,
				handledAt: at - 40 * 86_400_000,
				outcome
			});

		setSystemTime(new Date(later));
		await oldRow(later, 'first');
		await tick();
		expect(await dbRepo(TEST_EMAIL).events.recent(5)).toEqual([]);

		setSystemTime(new Date(later + 30 * MIN));
		await oldRow(later + 30 * MIN, 'second');
		await tick();
		expect((await dbRepo(TEST_EMAIL).events.recent(5)).map((event) => event.outcome)).toEqual([
			'second'
		]);

		setSystemTime(new Date(later + 61 * MIN));
		await tick();
		expect(await dbRepo(TEST_EMAIL).events.recent(5)).toEqual([]);
	});
});

describe('startAgent', () => {
	test('events within a few seconds become one reaction after the coalescing delay', async () => {
		await makeUser({ openaiKey: sealed('sk-saved') });
		const repo = dbRepo(TEST_EMAIL);
		const { requests } = fakeFetch({ [route]: () => Response.json(text('Nothing to add.')) });
		jest.useFakeTimers();
		// Fake timers start from the real clock, and after 22:00 the quiet hours would silence the reaction
		jest.setSystemTime(new Date(NOW));
		try {
			startAgent();
			await repo.events.insert({
				type: 'task.completed',
				payload: { title: 'x' },
				origin: 'user',
				createdAt: Date.now()
			});
			const ctx = serverCtx(TEST_EMAIL);
			ctx.react();
			ctx.react();
			ctx.react();

			jest.advanceTimersByTime(LIMITS.coalesceMs - 1);
			for (let i = 0; i < 50; i++) await Promise.resolve();
			expect(requests).toEqual([]);

			jest.advanceTimersByTime(1);
			for (let i = 0; i < 500 && requests.length === 0; i++) await Promise.resolve();
			expect(requests).toHaveLength(1);
		} finally {
			jest.useRealTimers();
		}
	});

	test('starting twice leaves one scheduler', () => {
		startAgent();
		const first = (globalThis as { __taskerAgent?: unknown }).__taskerAgent;
		startAgent();
		expect((globalThis as { __taskerAgent?: unknown }).__taskerAgent).not.toBe(first);
	});
});
