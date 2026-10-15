/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { showScreenHint, showWelcome, welcomeExample, type FirstRun } from '#lib/firstrun.js';
import { minutesLeft } from '#lib/priority.js';

const first: FirstRun = {
	guest: true,
	ready: true,
	problem: false,
	taskCount: 0,
	welcomed: false,
	hintSeen: false
};

describe('showWelcome', () => {
	test('shows on the very first visit', () => {
		expect(showWelcome(first)).toBe(true);
	});

	test.each([
		['signed in', { guest: false }],
		['the plan is still being read', { ready: false }],
		['the device could not be read', { problem: true }],
		['there are tasks on the device', { taskCount: 1 }],
		['it was answered before', { welcomed: true }]
	])('stays away when %s', (_, change) => {
		expect(showWelcome({ ...first, ...change })).toBe(false);
	});
});

describe('showScreenHint', () => {
	test('waits for the first task', () => {
		expect(showScreenHint(first)).toBe(false);
		expect(showScreenHint({ ...first, taskCount: 1 })).toBe(true);
	});

	test('shows once, a dismissed hint never comes back', () => {
		expect(showScreenHint({ ...first, taskCount: 3, hintSeen: true })).toBe(false);
	});

	test('does not show before the plan was read or when the device failed', () => {
		expect(showScreenHint({ ...first, taskCount: 1, ready: false })).toBe(false);
		expect(showScreenHint({ ...first, taskCount: 1, problem: true })).toBe(false);
	});

	test('also shows for a signed in visitor', () => {
		expect(showScreenHint({ ...first, guest: false, taskCount: 1 })).toBe(true);
	});
});

describe('welcomeExample', () => {
	test('is an active task with 28 minutes left', () => {
		const { hero, now } = welcomeExample();
		expect(hero.kind).toBe('active');
		if (hero.kind !== 'active') return;
		expect(minutesLeft(hero.task, now)).toBe(28);
		expect(hero.task.title).toBe('Write the report intro');
	});
});
