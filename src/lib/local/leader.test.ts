/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { electLeader } from '#lib/local/leader.js';
import { fakeLocks } from '#test/locks.js';

describe('electLeader', () => {
	test('without Web Locks the one tab leads at once', () => {
		let led = 0;
		electLeader(undefined, () => led++);
		expect(led).toBe(1);
	});

	test('the first tab leads, the second waits', () => {
		const { api } = fakeLocks();
		const led: string[] = [];
		electLeader(api, () => led.push('first'));
		electLeader(api, () => led.push('second'));
		expect(led).toEqual(['first']);
	});

	test('when the leader closes the next tab takes over', () => {
		const { api, release } = fakeLocks();
		const led: string[] = [];
		electLeader(api, () => led.push('first'));
		electLeader(api, () => led.push('second'));
		electLeader(api, () => led.push('third'));
		release();
		expect(led).toEqual(['first', 'second']);
		release();
		expect(led).toEqual(['first', 'second', 'third']);
	});

	test('a leader never gives the lock back by itself', async () => {
		const { api } = fakeLocks();
		let given = false;
		const request = api.request;
		api.request = (name, callback) => {
			const held = request(name, callback);
			void held.then(() => (given = true));
			return held;
		};
		electLeader(api, () => {});
		await Bun.sleep(5);
		expect(given).toBe(false);
	});
});
