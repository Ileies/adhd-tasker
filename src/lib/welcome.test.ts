/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { localBackend } from '#lib/local/backend.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';
import { defaultTimes } from '#lib/essentials.js';
import {
	addEssentials,
	answerWelcome,
	clearSampleDay,
	keepSampleDay,
	loadFlags,
	trySampleDay
} from '#lib/welcome.js';
import { testCtx } from '#test/ctx.js';
import { Priority } from '#lib/types.js';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let stored: Record<string, string>;

beforeEach(() => {
	stored = {};
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => stored[key] ?? null,
			setItem: (key: string, value: string) => void (stored[key] = value)
		}
	});
	tasker.tasks = [];
	tasker.routines = [];
	tasker.sample = [];
	tasker.firstRun = { welcomed: false };
	dismissToast();
});

afterEach(() => {
	tasker.backend = remoteBackend;
	dismissToast();
	if (original) Object.defineProperty(globalThis, 'localStorage', original);
	else Reflect.deleteProperty(globalThis, 'localStorage');
});

async function useLocalDevice() {
	const made = await testCtx();
	tasker.backend = localBackend({
		repo: made.repo,
		now: () => made.state.now,
		hint: () => 1,
		react: () => {}
	});
}

describe('flags', () => {
	test('answering the welcome is remembered on the device and in the page', () => {
		answerWelcome();
		expect(tasker.firstRun.welcomed).toBe(true);
		tasker.firstRun.welcomed = false;
		loadFlags();
		expect(tasker.firstRun).toEqual({ welcomed: true });
	});
});

describe('trySampleDay', () => {
	test('fills the plan with the sample, marks it and counts as answering the welcome', async () => {
		await useLocalDevice();
		await trySampleDay('2026-10-14', 12 * 60);
		expect(tasker.tasks.length).toBeGreaterThanOrEqual(4);
		expect(tasker.sample.sort()).toEqual(tasker.tasks.map((task) => task.id).sort());
		expect(tasker.firstRun.welcomed).toBe(true);
	});

	test('the week brings its to-dos into the page, clearing takes them out again', async () => {
		await useLocalDevice();
		await trySampleDay('2026-10-14', 12 * 60);
		expect(tasker.todos.map((todo) => todo.title)).toContain('Set up ADHD Tasker');
		await clearSampleDay();
		expect(tasker.todos).toEqual([]);
		expect(tasker.firstRun.welcomed).toBe(false);
	});

	test('says why when the device cannot add it', async () => {
		tasker.backend = remoteBackend;
		await trySampleDay('2026-10-14', 12 * 60);
		expect(tasker.toasts.at(-1)?.message).toContain('Could not add the sample day');
		expect(tasker.tasks).toEqual([]);
		expect(tasker.firstRun.welcomed).toBe(true);
	});
});

describe('addEssentials', () => {
	test('makes a daily routine for each chosen time and answers the welcome', async () => {
		await useLocalDevice();
		await addEssentials({ lunch: 13 * 60, bed: 23 * 60, dinner: null }, '2026-10-14', 9 * 60);
		expect(tasker.routines.map((routine) => [routine.title, routine.startTime])).toEqual([
			['Lunch', 13 * 60],
			['Go to bed', 23 * 60]
		]);
		expect(tasker.firstRun.welcomed).toBe(true);
		expect(tasker.toasts.at(-1)?.message).toBe('Added 2 daily routines');
	});

	test('what is over for today starts tomorrow, so the first screen has nothing missed', async () => {
		await useLocalDevice();
		await addEssentials(defaultTimes(), '2026-10-14', 12 * 60 + 8);
		const today = await tasker.backend.tasks.load('2026-10-14');
		expect(today.map((task) => task.title)).toEqual(['Lunch', 'Dinner', 'Go to bed']);
		expect(tasker.routines).toHaveLength(5);
	});

	test('the Undo removes the routines and their days again', async () => {
		await useLocalDevice();
		await addEssentials(defaultTimes(), '2026-10-14', 6 * 60);
		await tasker.toasts.at(-1)?.undo?.();
		expect(tasker.routines).toEqual([]);
		expect(await tasker.backend.tasks.since('2000-01-01')).toEqual([]);
	});

	test('choosing none adds nothing and still answers the welcome', async () => {
		await useLocalDevice();
		await addEssentials({}, '2026-10-14', 9 * 60);
		expect(tasker.routines).toEqual([]);
		expect(tasker.firstRun.welcomed).toBe(true);
		expect(tasker.toasts).toEqual([]);
	});

	test('says why when the device cannot add them', async () => {
		tasker.backend = remoteBackend;
		await addEssentials(defaultTimes(), '2026-10-14', 9 * 60);
		expect(tasker.toasts.at(-1)?.message).toContain('Could not add the essentials');
		expect(tasker.routines).toEqual([]);
	});
});

describe('clearSampleDay', () => {
	test('removes the sample and keeps what the user planned', async () => {
		await useLocalDevice();
		const mine = await tasker.backend.tasks.create({
			title: 'Mine',
			description: '',
			date: '2026-10-14',
			startTime: 1200,
			duration: 30,
			priority: Priority.Medium
		});
		tasker.tasks = [mine];
		await trySampleDay('2026-10-14', 12 * 60);
		await clearSampleDay();
		expect(tasker.tasks.map((task) => task.id)).toEqual([mine.id]);
		expect(tasker.sample).toEqual([]);
		expect(tasker.toasts.at(-1)?.message).toBe('Sample day cleared');
	});

	test('brings the welcome back when nothing else is left', async () => {
		await useLocalDevice();
		await trySampleDay('2026-10-14', 12 * 60);
		await clearSampleDay();
		expect(tasker.tasks).toEqual([]);
		expect(tasker.firstRun.welcomed).toBe(false);
	});

	test('does not bring the welcome back while the user has tasks of their own', async () => {
		await useLocalDevice();
		const mine = await tasker.backend.tasks.create({
			title: 'Mine',
			description: '',
			date: '2026-10-14',
			startTime: 1200,
			duration: 30,
			priority: Priority.Medium
		});
		tasker.tasks = [mine];
		await trySampleDay('2026-10-14', 12 * 60);
		await clearSampleDay();
		expect(tasker.firstRun.welcomed).toBe(true);
	});

	test('keeps the sample and says why when the device refuses', async () => {
		tasker.sample = [1, 2];
		tasker.tasks = [{ id: 1 } as never, { id: 2 } as never];
		tasker.backend = {
			sample: {
				clear: async () => {
					throw new BackendError('Storage is full', 507);
				}
			}
		} as unknown as Backend;
		await clearSampleDay();
		expect(tasker.sample).toEqual([1, 2]);
		expect(tasker.tasks).toHaveLength(2);
		expect(tasker.toasts.at(-1)?.message).toBe('Could not clear the sample day: Storage is full');
	});
});

describe('keepSampleDay', () => {
	test('keeps the tasks and drops the sample mark', async () => {
		await useLocalDevice();
		await trySampleDay('2026-10-14', 12 * 60);
		const count = tasker.tasks.length;
		await keepSampleDay();
		expect(tasker.sample).toEqual([]);
		expect(tasker.tasks).toHaveLength(count);
		expect(tasker.firstRun.welcomed).toBe(true);
	});
});
