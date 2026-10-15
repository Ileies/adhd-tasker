/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { localBackend } from '#lib/local/backend.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';
import {
	answerWelcome,
	clearSampleDay,
	dismissScreenHint,
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
	tasker.sample = [];
	tasker.firstRun = { welcomed: false, screenHintSeen: false };
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
	tasker.backend = localBackend({ repo: made.repo, hint: () => 1, react: () => {} });
}

describe('flags', () => {
	test('answering the welcome is remembered on the device and in the page', () => {
		answerWelcome();
		expect(tasker.firstRun.welcomed).toBe(true);
		tasker.firstRun.welcomed = false;
		loadFlags();
		expect(tasker.firstRun).toEqual({ welcomed: true, screenHintSeen: false });
	});

	test('dismissing the second screen hint is remembered and leaves the welcome alone', () => {
		dismissScreenHint();
		loadFlags();
		expect(tasker.firstRun).toEqual({ welcomed: false, screenHintSeen: true });
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

	test('says why when the device cannot add it', async () => {
		tasker.backend = remoteBackend;
		await trySampleDay('2026-10-14', 12 * 60);
		expect(tasker.toast?.message).toContain('Could not add the sample day');
		expect(tasker.tasks).toEqual([]);
		expect(tasker.firstRun.welcomed).toBe(true);
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
		expect(tasker.toast?.message).toBe('Sample day cleared');
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
		expect(tasker.toast?.message).toBe('Could not clear the sample day: Storage is full');
	});
});
