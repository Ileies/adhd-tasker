/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { POST } from './+server.js';
import { buildExport } from '#lib/core/export.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const task = {
	title: 'Write intro',
	description: '',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: 3,
	status: 'pending'
};
const file = {
	app: 'adhd-tasker',
	version: 1,
	exportedAt: 0,
	settings: { showClock: true },
	tasks: [task],
	alarms: []
};

describe('POST /import', () => {
	test('needs a login', async () => {
		expect((await callRoute(POST, { body: file })).status).toBe(401);
	});

	test('adds the tasks and the settings and answers what it did', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: file });
		expect(result).toMatchObject({ status: 200, body: { tasks: 1, skipped: 0, alarms: 0 } });
		expect(await dbRepo(TEST_EMAIL).tasks.between('2026-10-14', '2026-10-14')).toHaveLength(1);
		expect((await dbRepo(TEST_EMAIL).settings.get()).showClock).toBe(true);
	});

	test('a file that is not an export is refused with the reason and changes nothing', async () => {
		const user = await makeUser();
		const result = await callRoute(POST, { user, body: { hello: 'world' } });
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ message: 'This is not an ADHD Tasker export file' });
		expect(await dbRepo(TEST_EMAIL).tasks.between('2000-01-01')).toEqual([]);
	});

	test('a task already in the plan is left alone, so a second import adds nothing', async () => {
		const user = await makeUser();
		await makeTask({
			title: task.title,
			date: task.date,
			startTime: task.startTime,
			duration: task.duration
		});
		expect((await callRoute(POST, { user, body: file })).body).toMatchObject({
			tasks: 0,
			skipped: 1
		});
	});

	test('open screens are told to reload the schedule when alarms came in, and only then', async () => {
		const user = await makeUser();
		const heard: StreamMessage[] = [];
		const off = subscribe(TEST_EMAIL, 'tab', (message) => void heard.push(message));
		await callRoute(POST, { user, body: file });
		expect(heard).toEqual([]);
		const alarm = {
			fireAt: Date.now() + 3_600_000,
			minutes: null,
			repeat: 'none',
			label: 'Stretch',
			tone: 'chime',
			durationMin: 5
		};
		await callRoute(POST, { user, body: { ...file, alarms: [alarm] } });
		off();
		expect(heard).toEqual([{ type: 'schedule' }]);
	});

	test('an export of one account imports into another', async () => {
		await makeUser();
		await makeTask({ title: 'From Ada' });
		// What GET /export answers, as JSON
		const exported = JSON.parse(JSON.stringify(await buildExport(dbRepo(TEST_EMAIL), Date.now())));
		const bob = await makeUser({ email: 'bob@example.com' });
		const result = await callRoute(POST, { user: bob, body: exported });
		expect(result.body).toMatchObject({ tasks: 1 });
		expect((await dbRepo('bob@example.com').tasks.between('2000-01-01'))[0].title).toBe('From Ada');
	});
});
