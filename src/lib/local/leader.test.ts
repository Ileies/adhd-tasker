/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { LEADER_LOCK, electLeader, type LockApi } from '#lib/local/leader.js';

/** The browser's lock manager reduced to what matters: one holder at a time, the next waits until it is gone. */
function fakeLocks() {
	const held = new Set<string>();
	const queue: { name: string; run: () => Promise<void> }[] = [];
	const api: LockApi = {
		request(name, callback) {
			return new Promise((resolve) => {
				const grant = () => {
					held.add(name);
					void callback().then(resolve);
				};
				if (held.has(name)) queue.push({ name, run: async () => grant() });
				else grant();
			});
		}
	};
	/** The holder's tab closes: the browser hands the lock to the next in line. */
	const release = (name: string) => {
		held.delete(name);
		const next = queue.findIndex((item) => item.name === name);
		if (next !== -1) void queue.splice(next, 1)[0].run();
	};
	return { api, release };
}

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
		release(LEADER_LOCK);
		expect(led).toEqual(['first', 'second']);
		release(LEADER_LOCK);
		expect(led).toEqual(['first', 'second', 'third']);
	});

	test('a leader never gives the lock back by itself', async () => {
		const { api } = fakeLocks();
		let done = false;
		const request = api.request;
		api.request = (name, callback) => {
			const held = request(name, callback);
			void held.then(() => (done = true));
			return held;
		};
		electLeader(api, () => {});
		await Bun.sleep(5);
		expect(done).toBe(false);
	});
});
