/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	EXPORT_LIMITS,
	EXPORT_VERSION,
	buildExport,
	describeImport,
	exportFileName,
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
	status: TaskStatus.Pending,
	completedAt: null
};
const alarm = {
	fireAt: NOW + 60 * MIN,
	minutes: null,
	repeat: 'none' as const,
	label: 'Stretch',
	tone: 'chime' as const,
	durationMin: 5,
	enabled: true
};
const file = (overrides: Partial<ExportFile> = {}): ExportFile => ({
	app: 'adhd-tasker',
	version: EXPORT_VERSION,
	exportedAt: NOW,
	settings: {},
	tasks: [],
	todos: [],
	routines: [],
	alarms: [],
	flow: [],
	...overrides
});
const todo = {
	title: 'Study Math',
	description: '',
	priority: Priority.High,
	status: 'open' as const,
	estimate: 600,
	learned: false,
	progress: 25,
	spentMinutes: 90,
	skips: 1,
	skipSince: '2026-11-04',
	dueDate: '2026-11-05',
	dueTime: 665,
	parent: null,
	notBefore: null,
	nextStep: 'Open the notes',
	createdAt: 1000,
	completedAt: null
};

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
			'flow',
			'routines',
			'settings',
			'tasks',
			'todos',
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
			tasks: [{ ...task, kind: 'block', parent: null, shift: 30, routine: null }],
			alarms: [alarm],
			settings: { showClock: true, timezone: 'Europe/Berlin' }
		});
		expect(parseExport(JSON.parse(JSON.stringify(valid)))).toEqual({ ok: true, value: valid });
	});

	test('a file from before shifting makes every task stay', () => {
		expect(parseExport(file({ tasks: [task] }))).toMatchObject({
			ok: true,
			value: { tasks: [{ shift: 0 }] }
		});
	});

	test.each([
		['too far', 500],
		['fractional', 7.5],
		['text', '60']
	])('a shift that is %s means the task stays', (_name, shift) => {
		const result = parseExport(file({ tasks: [{ ...task, shift } as unknown as typeof task] }));
		expect(result).toMatchObject({ ok: true, value: { tasks: [{ shift: 0 }] } });
	});

	test('a file from before appointments makes every task a block', () => {
		expect(parseExport(file({ tasks: [task] }))).toMatchObject({
			ok: true,
			value: { tasks: [{ kind: 'block', parent: null }] }
		});
	});

	test('a kind that is not known and a parent that is not in the file are left out', () => {
		const result = parseExport(
			file({
				tasks: [{ ...task, kind: 'party', parent: 5 } as unknown as typeof task]
			})
		);
		expect(result).toMatchObject({ ok: true, value: { tasks: [{ kind: 'block', parent: null }] } });
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

describe('describeImport', () => {
	test.each([
		[{ tasks: 12, skipped: 0, alarms: 0, todos: 0 }, 'Imported 12 tasks.'],
		[{ tasks: 1, skipped: 0, alarms: 1, todos: 0 }, 'Imported 1 task and 1 alarm.'],
		[
			{ tasks: 3, skipped: 2, alarms: 2, todos: 0 },
			'Imported 3 tasks and 2 alarms. 2 tasks already here, left alone.'
		],
		[
			{ tasks: 0, skipped: 1, alarms: 0, todos: 0 },
			'Imported 0 tasks. 1 task already here, left alone.'
		]
	])('%j says %s', (result, sentence) => {
		expect(describeImport(result)).toBe(sentence);
	});

	test('the file is named by its day', () => {
		expect(exportFileName('2026-10-15')).toBe('adhd-tasker-2026-10-15.json');
	});
});

describe('appointments in a file', () => {
	test('travel keeps its appointment through an export and an import into another plan', async () => {
		const from = (await testCtx()).repo;
		const exam = await from.tasks.insert({
			...task,
			title: 'Exam Math',
			startTime: 720,
			kind: 'appointment'
		});
		await from.tasks.insert({
			...task,
			title: 'Travel to Exam Math',
			startTime: 480,
			duration: 45,
			kind: 'travel',
			parentId: exam.id
		});
		const exported = await buildExport(from, NOW);
		expect(exported.tasks.map((item) => [item.kind, item.parent])).toEqual([
			['travel', 1],
			['appointment', null]
		]);

		const to = (await testCtx()).repo;
		await to.tasks.insert({ ...task, title: 'Something else', startTime: 100 });
		await importExport(to, file(exported), NOW);
		const tasks = await to.tasks.between('0000-01-01');
		const appointment = tasks.find((item) => item.kind === 'appointment')!;
		const travel = tasks.find((item) => item.kind === 'travel')!;
		expect(travel.parentId).toBe(appointment.id);
		expect(appointment.parentId).toBeNull();
	});

	test('a travel task whose appointment is already there is linked to the one that is', async () => {
		const { repo } = await testCtx();
		const there = await repo.tasks.insert({ ...task, kind: 'appointment' });
		const travel = { ...task, startTime: 480, duration: 45, kind: 'travel' as const, parent: 1 };
		await importExport(
			repo,
			file({ tasks: [travel, { ...task, kind: 'appointment', parent: null }] }),
			NOW
		);
		const tasks = await repo.tasks.between('0000-01-01');
		expect(tasks).toHaveLength(2);
		expect(tasks.find((item) => item.kind === 'travel')?.parentId).toBe(there.id);
	});
});

describe('shifting in a file', () => {
	test('how far a task may move survives an export and an import', async () => {
		const from = (await testCtx()).repo;
		await from.tasks.insert({ ...task, title: 'Lunch', shift: 60 });
		const to = (await testCtx()).repo;
		await importExport(to, file(await buildExport(from, NOW)), NOW);
		expect((await to.tasks.between('0000-01-01'))[0]?.shift).toBe(60);
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
		expect(result).toEqual({ tasks: 1, skipped: 0, alarms: 1, todos: 0 });
		expect(await plan(repo)).toEqual([
			{ ...task, kind: 'block', parentId: null, shift: 0, routineId: null }
		]);
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
		expect(await importExport(repo, content, NOW)).toEqual({
			tasks: 0,
			skipped: 1,
			alarms: 0,
			todos: 0
		});
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
			enabled: false,
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
			durationMin: 2,
			enabled: false
		});
	});
});

describe('to-dos in an export', () => {
	test('the export holds every to-do, with its appointment as an index into the tasks', async () => {
		const { repo } = await testCtx();
		await repo.tasks.insert({ ...task, title: 'Other', date: '2026-10-13' });
		const exam = await repo.tasks.insert({ ...task, title: 'Exam Math', date: '2026-11-05' });
		await repo.todos.insert({
			title: 'Prepare',
			priority: Priority.High,
			parentId: exam.id,
			dueDate: '2026-11-05',
			createdAt: 5
		});
		await repo.todos.insert({
			title: 'Taxes',
			priority: Priority.Low,
			status: 'dropped',
			createdAt: 6
		});
		const exported = await buildExport(repo, NOW);
		expect(exported.todos.map((item) => [item.title, item.status, item.parent])).toEqual([
			['Prepare', 'open', 1],
			['Taxes', 'dropped', null]
		]);
	});

	test('the flow log is exported with links as indexes', async () => {
		const { repo } = await testCtx();
		const study = await repo.todos.insert({
			title: 'Study',
			priority: Priority.Medium,
			createdAt: 1
		});
		await repo.flow.insert({ at: 10, date: '2026-10-14', type: 'start' });
		await repo.flow.insert({
			at: 20,
			date: '2026-10-14',
			type: 'choose',
			todoId: study.id,
			data: { why: 'asked' }
		});
		expect((await buildExport(repo, NOW)).flow).toEqual([
			{ at: 10, date: '2026-10-14', type: 'start', todo: null, task: null, data: {} },
			{ at: 20, date: '2026-10-14', type: 'choose', todo: 0, task: null, data: { why: 'asked' } }
		]);
	});

	test('a to-do survives the round trip through the file', async () => {
		const valid = file({ todos: [todo] });
		expect(parseExport(JSON.parse(JSON.stringify(valid)))).toEqual({ ok: true, value: valid });
	});

	test('a version 1 file has no to-dos and its tasks have no completion time', () => {
		const { todos: _t, flow: _f, ...v1 } = file({ tasks: [{ ...task, completedAt: undefined }] });
		const result = parseExport({ ...v1, version: 1 });
		expect(result).toMatchObject({
			ok: true,
			value: { todos: [], flow: [], version: EXPORT_VERSION }
		});
		expect(result.ok && result.value.tasks[0].completedAt).toBeNull();
	});

	test('the flow log in a file is not read back', () => {
		const withFlow = file({
			flow: [{ at: 1, date: '2026-10-14', type: 'start', todo: null, task: null, data: {} }]
		});
		expect(parseExport(withFlow)).toMatchObject({ ok: true, value: { flow: [] } });
	});

	test('a bad to-do names its position and the reason', () => {
		const result = parseExport(file({ todos: [todo, { ...todo, progress: 101 }] }));
		expect(!result.ok && result.error).toStartWith('To-do 2 is not valid: ');
	});

	test.each([
		['an appointment that is not in the file', { ...todo, parent: 3 }],
		['a fractional appointment index', { ...todo, parent: 0.5 }],
		['a size of zero', { ...todo, estimate: 0 }],
		['a due time without a date', { ...todo, dueDate: null }]
	])('refuses a to-do with %s', (_name, bad) => {
		expect(parseExport(file({ todos: [bad] })).ok).toBe(false);
	});

	test('more to-dos than the limit are refused', () => {
		const many = Array.from({ length: EXPORT_LIMITS.todos + 1 }, () => todo);
		expect(parseExport(file({ todos: many })).ok).toBe(false);
	});

	test('what the file calls the engine state is kept inside its bounds', () => {
		const result = parseExport(
			file({ todos: [{ ...todo, spentMinutes: -4, skips: 99_999, learned: true }] })
		);
		expect(result.ok && result.value.todos[0]).toMatchObject({
			spentMinutes: 0,
			skips: 0,
			learned: true
		});
	});

	test('the day of the first skip is kept when it is a date and dropped when it is not', () => {
		const kept = parseExport(file({ todos: [{ ...todo, skipSince: '2026-10-12' }] }));
		expect(kept.ok && kept.value.todos[0].skipSince).toBe('2026-10-12');
		const dropped = parseExport(file({ todos: [{ ...todo, skipSince: 'yesterday' as never }] }));
		expect(dropped.ok && dropped.value.todos[0].skipSince).toBeNull();
	});

	test('an unknown status becomes open', () => {
		const result = parseExport(file({ todos: [{ ...todo, status: 'lost' as never }] }));
		expect(result.ok && result.value.todos[0].status).toBe('open');
	});

	test('importing adds the to-dos and links them to their appointment', async () => {
		const { repo } = await testCtx();
		const content = file({
			tasks: [task],
			todos: [
				{ ...todo, parent: 0 },
				{ ...todo, title: 'Other', parent: null }
			]
		});
		const result = await importExport(repo, content, NOW);
		expect(result).toMatchObject({ tasks: 1, todos: 2 });
		const exam = (await repo.tasks.between('0000-01-01'))[0];
		const todos = await repo.todos.all();
		expect(todos.map((item) => [item.title, item.parentId])).toEqual([
			['Study Math', exam.id],
			['Other', null]
		]);
		expect(todos[0]).toMatchObject({ estimate: 600, progress: 25, spentMinutes: 90, dueTime: 665 });
	});

	test('importing the same file twice adds no to-do twice and still finds the appointment', async () => {
		const { repo } = await testCtx();
		const content = file({ tasks: [task], todos: [{ ...todo, parent: 0 }] });
		await importExport(repo, content, NOW);
		const again = await importExport(repo, content, NOW);
		expect(again).toMatchObject({ tasks: 0, skipped: 1, todos: 0 });
		expect(await repo.todos.all()).toHaveLength(1);
	});

	test('describeImport names the to-dos', () => {
		expect(describeImport({ tasks: 2, skipped: 0, alarms: 1, todos: 3 })).toBe(
			'Imported 2 tasks and 3 to-dos and 1 alarm.'
		);
	});
});

describe('routines in an export', () => {
	const lunch = {
		title: 'Lunch',
		description: '',
		priority: Priority.Medium,
		startTime: 720,
		duration: 45,
		shift: 60,
		kind: 'block' as const,
		repeat: 'weekdays' as const,
		firstDay: '2026-10-14',
		lastDay: null,
		through: '2026-10-27'
	};

	test('the export holds every routine, its tasks say which one made them', async () => {
		const { repo } = await testCtx();
		const made = await repo.routines.insert(lunch);
		await repo.tasks.insert({ ...task, title: 'Own' });
		await repo.tasks.insert({ ...task, title: 'Lunch', routineId: made.id });
		const exported = await buildExport(repo, NOW);
		expect(exported.routines).toEqual([lunch]);
		expect(exported.tasks.map((item) => [item.title, item.routine])).toEqual([
			['Own', null],
			['Lunch', 0]
		]);
	});

	test('a routine survives the round trip through the file', () => {
		const valid = file({ routines: [lunch], tasks: [{ ...task, routine: 0 }] });
		expect(parseExport(JSON.parse(JSON.stringify(valid)))).toMatchObject({
			ok: true,
			value: { routines: [lunch], tasks: [{ routine: 0 }] }
		});
	});

	test('a file from before routines has none and its tasks are their own', () => {
		const { routines: _r, ...old } = file({ tasks: [task] });
		const result = parseExport(old);
		expect(result.ok && result.value.routines).toEqual([]);
		expect(result.ok && result.value.tasks[0].routine).toBeNull();
	});

	test('a task that names a routine the file does not have is its own', () => {
		const result = parseExport(file({ tasks: [{ ...task, routine: 4 }] }));
		expect(result.ok && result.value.tasks[0].routine).toBeNull();
	});

	test('a bad routine names its position and the reason', () => {
		const result = parseExport(file({ routines: [lunch, { ...lunch, repeat: 'none' as never }] }));
		expect(!result.ok && result.error).toStartWith('Routine 2 is not valid: ');
	});

	test.each([
		['no first day', { ...lunch, firstDay: undefined }],
		['a last day before the first', { ...lunch, lastDay: '2026-10-01' }],
		['a time across midnight', { ...lunch, startTime: 1400, duration: 100 }],
		['a repeat that is not one', { ...lunch, repeat: 'sometimes' }]
	])('refuses a routine with %s', (_name, bad) => {
		expect(parseExport(file({ routines: [bad as never] })).ok).toBe(false);
	});

	test('more routines than the limit are refused', () => {
		const many = Array.from({ length: EXPORT_LIMITS.routines + 1 }, () => lunch);
		expect(parseExport(file({ routines: many })).ok).toBe(false);
	});

	test('a through that is not a date is dropped', () => {
		const result = parseExport(file({ routines: [{ ...lunch, through: 'soon' as never }] }));
		expect(result.ok && result.value.routines[0].through).toBeNull();
	});

	test('importing adds the routine and links its tasks to it', async () => {
		const { repo } = await testCtx();
		await importExport(repo, file({ routines: [lunch], tasks: [{ ...task, routine: 0 }] }), NOW);
		const [made] = await repo.routines.all();
		expect(made).toMatchObject({ title: 'Lunch', through: '2026-10-27' });
		expect((await repo.tasks.between('0000-01-01'))[0].routineId).toBe(made.id);
	});

	test('importing the same file twice adds the routine once', async () => {
		const { repo } = await testCtx();
		const content = file({ routines: [lunch], tasks: [{ ...task, routine: 0 }] });
		await importExport(repo, content, NOW);
		await importExport(repo, content, NOW);
		expect(await repo.routines.all()).toHaveLength(1);
		expect(await repo.tasks.between('0000-01-01')).toHaveLength(1);
	});
});
