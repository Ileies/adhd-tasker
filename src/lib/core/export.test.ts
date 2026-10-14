/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	EXPORT_LIMITS,
	EXPORT_VERSION,
	buildExport,
	importExport,
	parseExport,
	type ExportFile
} from '#lib/core/export.js';
import type { Repo } from '#lib/core/repo.js';
import { Priority, TaskStatus } from '#lib/types.js';
import { NOW, testCtx } from '#test/ctx.js';

const MIN = 60_000;
const task = {
	title: 'Write intro',
	description: 'first draft',
	date: '2026-10-14',
	startTime: 540,
	duration: 60,
	priority: Priority.High,
	status: TaskStatus.Pending
};
const alarm = {
	fireAt: NOW + 60 * MIN,
	minutes: null,
	repeat: 'none' as const,
	label: 'Stretch',
	tone: 'chime' as const,
	durationMin: 5
};
const file = (overrides: Partial<ExportFile> = {}): ExportFile => ({
	app: 'adhd-tasker',
	version: 1,
	exportedAt: NOW,
	settings: {},
	tasks: [],
	alarms: [],
	...overrides
});

const plan = async (repo: Repo) =>
	(await repo.tasks.between('0000-01-01')).map(({ id: _id, ...rest }) => rest);

describe('buildExport', () => {
	test('holds the plan without ids, the pending alarms and the settings the user chose', async () => {
		const { repo } = await testCtx();
		await repo.tasks.insert(task);
		await repo.schedule.insert({
			kind: 'alarm',
			fireAt: alarm.fireAt,
			label: 'Stretch',
			tone: 'chime',
			createdBy: 'user',
			createdAt: NOW
		});
		await repo.settings.update({ showClock: true, overrunMinutes: 30, timezone: 'Asia/Tokyo' });
		const exported = await buildExport(repo, NOW);
		expect(exported).toMatchObject({
			app: 'adhd-tasker',
			version: EXPORT_VERSION,
			exportedAt: NOW,
			tasks: [task],
			alarms: [{ label: 'Stretch', repeat: 'none', durationMin: 5 }],
			settings: { showClock: true, overrunMinutes: 30, timezone: 'Asia/Tokyo' }
		});
		expect(exported.tasks[0]).not.toHaveProperty('id');
	});

	test('never holds the OpenAI key, the assistant log or the machine bound settings', async () => {
		const { repo } = await testCtx();
		await repo.settings.update({
			openaiKey: 'sk-very-secret',
			displayDevice: 'laptop',
			googleServices: 'calendar'
		});
		await repo.events.insert({ type: 'task.created', payload: {}, origin: 'user', createdAt: NOW });
		await repo.actions.record({
			tool: 'add_task',
			before: null,
			after: null,
			eventId: null,
			reason: 'x'
		});
		const text = JSON.stringify(await buildExport(repo, NOW));
		expect(text).not.toContain('sk-very-secret');
		expect(text).not.toContain('laptop');
		expect(text).not.toContain('calendar');
		expect(Object.keys(JSON.parse(text)).sort()).toEqual([
			'alarms',
			'app',
			'exportedAt',
			'settings',
			'tasks',
			'version'
		]);
	});

	test('leaves out wakeups and alarms that were cancelled or are over', async () => {
		const { repo } = await testCtx();
		await repo.schedule.insert({
			kind: 'wakeup',
			fireAt: NOW + MIN,
			note: 'x',
			createdBy: 'agent',
			createdAt: NOW
		});
		const gone = await repo.schedule.insert({
			kind: 'alarm',
			fireAt: NOW + MIN,
			label: 'a',
			createdBy: 'user',
			createdAt: NOW
		});
		await repo.schedule.cancel(gone.id);
		expect((await buildExport(repo, NOW)).alarms).toEqual([]);
	});

	test('an empty device exports an empty file that imports cleanly', async () => {
		const { repo } = await testCtx();
		const exported = await buildExport(repo, NOW);
		expect(exported.tasks).toEqual([]);
		expect(parseExport(JSON.parse(JSON.stringify(exported))).ok).toBe(true);
	});
});

describe('parseExport', () => {
	test('a valid file comes back as it is', () => {
		const valid = file({
			tasks: [task],
			alarms: [alarm],
			settings: { showClock: true, timezone: 'Europe/Berlin' }
		});
		expect(parseExport(JSON.parse(JSON.stringify(valid)))).toEqual({ ok: true, value: valid });
	});

	test('alarms and settings may be missing', () => {
		const { alarms: _alarms, settings: _settings, ...bare } = file({ tasks: [task] });
		expect(parseExport(bare)).toMatchObject({ ok: true, value: { alarms: [], settings: {} } });
	});

	test.each([
		['text', 'hello'],
		['an array', []],
		['null', null],
		['another app', { ...file(), app: 'other' }],
		['no version', { ...file(), version: undefined }],
		['version 0', { ...file(), version: 0 }],
		['a fractional version', { ...file(), version: 1.5 }],
		['tasks that are not a list', { ...file(), tasks: {} }],
		['alarms that are not a list', { ...file(), alarms: 'x' }],
		['settings that are not an object', { ...file(), settings: [] }]
	])('refuses %s', (_name, raw) => {
		expect(parseExport(raw).ok).toBe(false);
	});

	test('a file from a newer version says to update the app', () => {
		expect(parseExport({ ...file(), version: EXPORT_VERSION + 1 })).toEqual({
			ok: false,
			error: 'This file comes from a newer version of the app, update the app first'
		});
	});

	test('a bad task names its position and the reason', () => {
		const result = parseExport(file({ tasks: [task, { ...task, duration: 0 }] }));
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toStartWith('Task 2 is not valid: ');
	});

	test('a task that crosses midnight is refused like anywhere else', () => {
		expect(parseExport(file({ tasks: [{ ...task, startTime: 1430 }] })).ok).toBe(false);
	});

	test('more tasks than the limit are refused before any is read', () => {
		const many = Array.from({ length: EXPORT_LIMITS.tasks + 1 }, () => task);
		expect(parseExport(file({ tasks: many })).ok).toBe(false);
	});

	test.each([
		['a past-less fireAt', { ...alarm, fireAt: -1 }],
		['no label', { ...alarm, label: '  ' }],
		['an unknown repeat', { ...alarm, repeat: 'hourly' }],
		['a repeating alarm without a clock time', { ...alarm, repeat: 'daily', minutes: null }],
		['a duration of zero', { ...alarm, durationMin: 0 }],
		['a clock time past midnight', { ...alarm, repeat: 'daily', minutes: 1440 }]
	])('refuses an alarm with %s', (_name, bad) => {
		expect(parseExport(file({ alarms: [bad as never] })).ok).toBe(false);
	});

	test.each([
		['an unknown setting', { openaiKey: 'sk-x' }],
		['a value out of range', { overrunMinutes: 0 }],
		['a timezone that does not exist', { timezone: 'Mars/Base' }]
	])('refuses settings with %s', (_name, settings) => {
		expect(parseExport(file({ settings: settings as never })).ok).toBe(false);
	});

	test('an unknown tone becomes the default tone instead of failing the whole file', () => {
		const result = parseExport(file({ alarms: [{ ...alarm, tone: 'bogus' as never }] }));
		expect(result.ok).toBe(true);
	});
});

describe('importExport', () => {
	test('adds the tasks and alarms and applies the settings', async () => {
		const { repo } = await testCtx();
		const result = await importExport(
			repo,
			file({ tasks: [task], alarms: [alarm], settings: { showClock: true } }),
			NOW
		);
		expect(result).toEqual({ tasks: 1, skipped: 0, alarms: 1 });
		expect(await plan(repo)).toEqual([task]);
		expect((await repo.schedule.pending())[0]).toMatchObject({
			label: 'Stretch',
			createdBy: 'user'
		});
		expect((await repo.settings.get()).showClock).toBe(true);
	});

	test('importing the same file twice changes nothing the second time', async () => {
		const { repo } = await testCtx();
		const content = file({ tasks: [task], alarms: [alarm] });
		await importExport(repo, content, NOW);
		expect(await importExport(repo, content, NOW)).toEqual({ tasks: 0, skipped: 1, alarms: 0 });
		expect(await plan(repo)).toHaveLength(1);
		expect(await repo.schedule.pending()).toHaveLength(1);
	});

	test('what the device already has is never replaced', async () => {
		const { repo } = await testCtx();
		const mine = await repo.tasks.insert({ ...task, title: 'Mine', date: '2026-10-20' });
		await importExport(repo, file({ tasks: [task] }), NOW);
		expect((await repo.tasks.get(mine.id))?.title).toBe('Mine');
		expect(await plan(repo)).toHaveLength(2);
	});

	test('an alarm in the past is not brought back, a repeating one is', async () => {
		const { repo } = await testCtx();
		await importExport(
			repo,
			file({
				alarms: [
					{ ...alarm, fireAt: NOW - MIN },
					{ ...alarm, label: 'Meds', repeat: 'daily', minutes: 480, fireAt: NOW - MIN }
				]
			}),
			NOW
		);
		expect((await repo.schedule.pending()).map((entry) => entry.label)).toEqual(['Meds']);
	});

	test('an import is not a burst of plan edits: nothing is logged for the agent', async () => {
		const { repo, state } = await testCtx();
		await importExport(repo, file({ tasks: [task, { ...task, startTime: 700 }] }), NOW);
		expect(await repo.events.recent(5)).toEqual([]);
		expect(state.reacts).toBe(0);
	});

	test('a file without settings leaves the settings alone', async () => {
		const { repo } = await testCtx();
		await repo.settings.update({ overrunMinutes: 40 });
		await importExport(repo, file({ tasks: [task] }), NOW);
		expect((await repo.settings.get()).overrunMinutes).toBe(40);
	});
});

describe('export then import', () => {
	const date = fc
		.tuple(
			fc.integer({ min: 2024, max: 2030 }),
			fc.integer({ min: 1, max: 12 }),
			fc.integer({ min: 1, max: 28 })
		)
		.map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
	const generated = fc.record({
		title: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim() === s && s.length > 0),
		description: fc.string({ maxLength: 80 }),
		date,
		startTime: fc.integer({ min: 0, max: 1000 }),
		duration: fc.integer({ min: 5, max: 400 }),
		priority: fc.constantFrom(1, 2, 3, 4, 5) as fc.Arbitrary<Priority>,
		status: fc.constantFrom(TaskStatus.Pending, TaskStatus.Completed)
	});

	test('the plan comes out as it went in, through JSON', async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(generated, { maxLength: 25 }), async (tasks) => {
				const source = await testCtx();
				for (const item of tasks) await source.repo.tasks.insert(item);
				const text = JSON.stringify(await buildExport(source.repo, NOW));

				const parsed = parseExport(JSON.parse(text));
				if (!parsed.ok) throw new Error(parsed.error);
				const target = await testCtx();
				await importExport(target.repo, parsed.value, NOW);

				// Identical tasks collapse into one on import, that is the intended duplicate rule
				const unique = new Map(
					tasks.map((item) => [
						`${item.date}|${item.startTime}|${item.duration}|${item.title}`,
						item
					])
				);
				expect(await plan(target.repo)).toEqual(
					(await plan(source.repo)).filter(
						(item, index, all) =>
							all.findIndex(
								(other) =>
									`${other.date}|${other.startTime}|${other.duration}|${other.title}` ===
									`${item.date}|${item.startTime}|${item.duration}|${item.title}`
							) === index
					)
				);
				expect((await plan(target.repo)).length).toBe(unique.size);
			}),
			{ numRuns: 40 }
		);
	});

	test('settings and alarms survive the round trip too', async () => {
		const source = await testCtx();
		await source.repo.settings.update({
			aiAutonomy: 'act',
			quietStart: 1300,
			dailyTokenBudget: 5000,
			timezone: 'Asia/Tokyo'
		});
		await source.repo.schedule.insert({
			kind: 'alarm',
			fireAt: NOW + 4 * 3_600_000,
			minutes: 600,
			repeat: 'weekdays',
			label: 'Standup',
			tone: 'soft',
			durationMin: 2,
			createdBy: 'user',
			createdAt: NOW
		});
		const parsed = parseExport(JSON.parse(JSON.stringify(await buildExport(source.repo, NOW))));
		if (!parsed.ok) throw new Error(parsed.error);

		const target = await testCtx();
		await importExport(target.repo, parsed.value, NOW);
		expect(await target.repo.settings.get()).toMatchObject({
			aiAutonomy: 'act',
			quietStart: 1300,
			dailyTokenBudget: 5000,
			timezone: 'Asia/Tokyo'
		});
		expect((await target.repo.schedule.pending())[0]).toMatchObject({
			label: 'Standup',
			repeat: 'weekdays',
			minutes: 600,
			durationMin: 2
		});
	});
});
