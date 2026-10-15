/// <reference types="bun" />
import { afterEach, describe, expect, test } from 'bun:test';
import { CHANNEL_NAME, startLocalRuntime, type LocalMessage } from '#lib/local/runtime.js';
import { Priority } from '#lib/types.js';
import { freshIndexedDb } from '#test/idb.js';
import { fakeLocks } from '#test/locks.js';

const task = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: Priority.Medium
};

/** One device with two tabs: the same storage, the same locks, the same channel name. */
async function twoTabs() {
	const factory = freshIndexedDb();
	const locks = fakeLocks();
	const open = async () => {
		const seen: LocalMessage[] = [];
		const leading: boolean[] = [];
		const runtime = await startLocalRuntime(
			{ handle: (message) => seen.push(message), onLeader: (on) => leading.push(on) },
			{
				factory,
				locks: locks.api,
				channel: new BroadcastChannel(CHANNEL_NAME),
				tickMs: 1_000_000,
				coalesceMs: 5
			}
		);
		return { ...runtime, seen, leading };
	};
	const leader = await open();
	const follower = await open();
	return { leader, follower, locks, factory };
}

/** Lets the broadcast channel deliver. */
const settle = () => Bun.sleep(30);

const running: { stop(): void }[] = [];
afterEach(() => running.splice(0).forEach((tab) => tab.stop()));

async function tabs() {
	const made = await twoTabs();
	running.push(made.leader, made.follower);
	return made;
}

describe('a device with two tabs', () => {
	test('the first tab leads, the second follows', async () => {
		const { leader, follower } = await tabs();
		expect(leader.leading).toEqual([false, true]);
		expect(follower.leading).toEqual([false]);
	});

	test('the second tab leads when the first one closes', async () => {
		const { leader, follower, locks } = await tabs();
		leader.stop();
		locks.release();
		expect(follower.leading).toEqual([false, true]);
	});

	test('both tabs see the same plan, it is one database', async () => {
		const { leader, follower } = await tabs();
		const created = await follower.backend.tasks.create(task);
		expect(await leader.backend.tasks.load('2026-10-14')).toEqual([created]);
	});

	test('a plan change in one tab tells the other which days to reload', async () => {
		const { leader, follower } = await tabs();
		await follower.backend.tasks.create(task);
		await settle();
		expect(leader.seen).toContainEqual({ type: 'plan', dates: ['2026-10-14'] });
		expect(follower.seen.filter((message) => message.type === 'plan')).toEqual([]);
	});

	test('an alarm set in one tab changes the schedule shown in the other', async () => {
		const { leader, follower } = await tabs();
		await follower.backend.schedule.addAlarm({
			in_minutes: 10,
			label: 'Stretch',
			tone: 'chime',
			repeat: 'none'
		});
		await settle();
		expect(follower.seen).toContainEqual({ type: 'schedule' });
		expect(leader.seen).toContainEqual({ type: 'schedule' });
	});

	test('erasing in one tab deletes the database and tells every other tab to start again', async () => {
		const { leader, follower, factory } = await tabs();
		await follower.backend.tasks.create(task);
		await leader.backend.data.erase();
		await settle();
		expect(follower.seen).toContainEqual({ type: 'reload' });

		// What is opened next is a new, empty database
		const again = await startLocalRuntime(
			{ handle: () => {}, onLeader: () => {} },
			{ factory, channel: null }
		);
		expect(await again.backend.tasks.since('0000-01-01')).toEqual([]);
		again.stop();
	});

	test('an event made in a follower is picked up by the leader, who runs the agent', async () => {
		const { leader, follower } = await tabs();
		await follower.backend.tasks.create(task);
		// The follower never reacts by itself and no tick runs: only the leader's reaction can settle the event
		let { events } = await follower.backend.activity.load();
		for (let i = 0; i < 200 && !events[0]?.outcome; i++) {
			await Bun.sleep(10);
			({ events } = await follower.backend.activity.load());
		}
		expect(events[0].outcome).toBe('silent: no OpenAI key');
		expect(leader.leading.at(-1)).toBe(true);
	});
});
