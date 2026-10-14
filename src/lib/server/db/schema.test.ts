/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	agentActions,
	agentCards,
	aiUsage,
	events,
	reminders,
	schedule,
	tasks,
	users
} from '#lib/server/db/schema.js';
import { resetDb } from '#test/db.js';
import { makeTask, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const count = (table: typeof reminders) =>
	db
		.select({ n: sql<number>`count(*)` })
		.from(table)
		.get()!.n;

describe('foreign keys', () => {
	test('are enforced by the connection', () => {
		expect(db.$client.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
	});

	test('a row cannot point at a user that does not exist', () => {
		expect(() =>
			db
				.insert(tasks)
				.values({
					title: 'x',
					description: '',
					email: 'ghost@example.com',
					date: '2026-10-14',
					startTime: 0,
					duration: 30
				})
				.run()
		).toThrow();
	});

	test('deleting a user removes every row that belongs to them', async () => {
		const user = await makeUser();
		const other = await makeUser({ email: 'other@example.com' });
		const task = await makeTask({ email: user.email });
		await makeTask({ email: other.email });
		const now = 1_000_000;
		for (const email of [user.email, other.email]) {
			db.insert(agentActions).values({ email, tool: 'add_task', createdAt: now }).run();
			db.insert(events)
				.values({ email, type: 'task.created', payload: {}, origin: 'user', createdAt: now })
				.run();
			db.insert(agentCards).values({ email, kind: 'say', text: 'hi', createdAt: now }).run();
			db.insert(schedule)
				.values({ email, kind: 'alarm', fireAt: now, createdBy: 'user', createdAt: now })
				.run();
			db.insert(aiUsage).values({ email, use: 'chat', tokens: 5, createdAt: now }).run();
		}
		db.insert(reminders).values({ taskId: task.id, reminderTime: 1 }).run();

		db.delete(users).where(eq(users.email, user.email)).run();

		for (const table of [tasks, agentActions, events, agentCards, schedule, aiUsage]) {
			expect(
				db
					.select()
					.from(table)
					.where(eq(getTableColumns(table).email, user.email))
					.all()
			).toEqual([]);
			expect(
				db
					.select()
					.from(table)
					.where(eq(getTableColumns(table).email, other.email))
					.all()
			).toHaveLength(1);
		}
		expect(count(reminders)).toBe(0);
	});
});
