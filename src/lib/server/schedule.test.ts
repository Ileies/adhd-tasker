/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { dbRepo } from '#lib/server/db-repo.js';
import { announceDisplay, fireAllDue } from '#lib/server/schedule.js';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { resetDb } from '#test/db.js';
import { makeUser } from '#test/fixtures.js';

const MIN = 60_000;
const NOW = Date.parse('2026-10-14T09:00:00Z');

const ADA = 'ada@example.com';
const BOB = 'bob@example.com';

const listen = (email: string, device: string | null = null) => {
	const received: StreamMessage[] = [];
	const off = subscribe(email, device, (message) => received.push(message));
	cleanup.push(off);
	return received;
};
let cleanup: (() => void)[] = [];

beforeEach(async () => {
	await resetDb();
	setSystemTime(new Date(NOW));
});
afterEach(() => {
	cleanup.forEach((off) => off());
	cleanup = [];
});

const addAlarm = (email: string, fireAt: number, extra: Record<string, unknown> = {}) =>
	dbRepo(email).schedule.insert({
		kind: 'alarm',
		fireAt,
		label: 'Stretch',
		createdBy: 'user',
		createdAt: NOW - 10 * MIN,
		...extra
	});

describe('fireAllDue', () => {
	test('rings what is due for each account and nobody else', async () => {
		await makeUser({ email: ADA });
		await makeUser({ email: BOB });
		const ada = listen(ADA);
		const bob = listen(BOB);
		const due = await addAlarm(ADA, NOW - MIN);
		await addAlarm(BOB, NOW + 30 * MIN);

		await fireAllDue();

		expect(ada.map((message) => message.type)).toEqual(['alarm', 'schedule']);
		expect(ada[0]).toMatchObject({ type: 'alarm', id: due.id, label: 'Stretch' });
		expect(bob).toEqual([]);
		expect(await dbRepo(ADA).schedule.pending()).toEqual([]);
		expect(await dbRepo(BOB).schedule.pending()).toHaveLength(1);
	});

	test('does nothing when nothing is due', async () => {
		await makeUser({ email: ADA });
		const ada = listen(ADA);
		await addAlarm(ADA, NOW + MIN);
		await fireAllDue();
		expect(ada).toEqual([]);
	});

	test("a repeating alarm moves on in the account's own timezone", async () => {
		await makeUser({ email: ADA, timezone: 'Europe/Berlin' });
		// 09:00 UTC is 11:00 in Berlin, so a daily 11:00 alarm is due right now
		await addAlarm(ADA, NOW, { minutes: 11 * 60, repeat: 'daily' });
		await fireAllDue();
		const [next] = await dbRepo(ADA).schedule.pending();
		expect(next.fireAt).toBe(NOW + 24 * 60 * MIN);
	});

	test('a wakeup is logged for the agent and rings nothing', async () => {
		await makeUser({ email: ADA });
		const ada = listen(ADA);
		await dbRepo(ADA).schedule.insert({
			kind: 'wakeup',
			fireAt: NOW - MIN,
			note: 'check the plan',
			createdBy: 'agent',
			createdAt: NOW - 10 * MIN
		});
		await fireAllDue();
		expect(ada.map((message) => message.type)).toEqual(['schedule']);
		expect((await dbRepo(ADA).events.recent(1))[0]).toMatchObject({
			type: 'wakeup.fired',
			payload: { note: 'check the plan' }
		});
	});

	test('the same alarm never rings twice across ticks', async () => {
		await makeUser({ email: ADA });
		const ada = listen(ADA);
		await addAlarm(ADA, NOW - MIN);
		await fireAllDue();
		await fireAllDue();
		expect(ada.filter((message) => message.type === 'alarm')).toHaveLength(1);
	});
});

describe('announceDisplay', () => {
	test('tells every tab which device plays while the chosen one is connected', async () => {
		await makeUser({ email: ADA, displayDevice: 'kitchen' });
		const tabs = listen(ADA, 'kitchen');
		await announceDisplay(ADA);
		expect(tabs).toEqual([{ type: 'display', device: 'kitchen' }]);
	});

	test('falls back to every device when the chosen one is not connected', async () => {
		await makeUser({ email: ADA, displayDevice: 'kitchen' });
		const tabs = listen(ADA, 'phone');
		await announceDisplay(ADA);
		expect(tabs).toEqual([{ type: 'display', device: null }]);
	});

	test('no chosen device means every device', async () => {
		await makeUser({ email: ADA });
		const tabs = listen(ADA, 'phone');
		await announceDisplay(ADA);
		expect(tabs).toEqual([{ type: 'display', device: null }]);
	});
});
