import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	agentActions,
	agentCards,
	aiUsage,
	events,
	flowLog,
	schedule,
	tasks,
	todos,
	users
} from '#lib/server/db/schema.js';
import type { Repo, Settings, Task } from '#lib/core/repo.js';

/** Every setting of the users row: the email and nothing else stays out of `Settings`. */
const settingsOf = ({ email: _email, ...settings }: typeof users.$inferSelect): Settings =>
	settings;

/** The repo of one account. Scoping by email lives here and nowhere else. */
export function dbRepo(email: string): Repo {
	const mine = {
		tasks: eq(tasks.email, email),
		todos: eq(todos.email, email),
		flow: eq(flowLog.email, email),
		actions: eq(agentActions.email, email),
		events: eq(events.email, email),
		cards: eq(agentCards.email, email),
		schedule: eq(schedule.email, email),
		usage: eq(aiUsage.email, email)
	};

	return {
		email,

		tasks: {
			async between(from, to) {
				const rows = await db
					.select()
					.from(tasks)
					.where(
						and(
							mine.tasks,
							gte(tasks.date, from),
							to === undefined ? undefined : lte(tasks.date, to)
						)
					);
				return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime - b.startTime);
			},
			async get(id) {
				const [row] = await db
					.select()
					.from(tasks)
					.where(and(mine.tasks, eq(tasks.id, id)));
				return row ?? null;
			},
			async insert(task) {
				const [row] = await db
					.insert(tasks)
					.values({ ...task, email })
					.returning();
				return row;
			},
			async update(id, patch) {
				if (Object.keys(patch).length === 0) return this.get(id);
				const [row] = await db
					.update(tasks)
					.set(patch)
					.where(and(mine.tasks, eq(tasks.id, id)))
					.returning();
				return row ?? null;
			},
			async delete(id) {
				const [row] = await db
					.delete(tasks)
					.where(and(mine.tasks, eq(tasks.id, id)))
					.returning();
				return row ?? null;
			},
			async restore(task) {
				await db
					.insert(tasks)
					.values({ ...task, email })
					.onConflictDoNothing();
			}
		},

		todos: {
			async open() {
				const rows = await db
					.select()
					.from(todos)
					.where(and(mine.todos, eq(todos.status, 'open')))
					.orderBy(asc(todos.id));
				return rows.map(bare);
			},
			async all() {
				const rows = await db.select().from(todos).where(mine.todos).orderBy(asc(todos.id));
				return rows.map(bare);
			},
			async doneSince(at) {
				const rows = await db
					.select()
					.from(todos)
					.where(and(mine.todos, eq(todos.status, 'done'), gte(todos.completedAt, at)))
					.orderBy(asc(todos.id));
				return rows.map(bare);
			},
			async get(id) {
				const [row] = await db
					.select()
					.from(todos)
					.where(and(mine.todos, eq(todos.id, id)));
				return row ? bare(row) : null;
			},
			async insert(todo) {
				const [row] = await db
					.insert(todos)
					.values({ ...todo, email, createdAt: todo.createdAt ?? Date.now() })
					.returning();
				return bare(row);
			},
			async update(id, patch) {
				if (Object.keys(patch).length === 0) return this.get(id);
				const [row] = await db
					.update(todos)
					.set(patch)
					.where(and(mine.todos, eq(todos.id, id)))
					.returning();
				return row ? bare(row) : null;
			},
			async delete(id) {
				const [row] = await db
					.delete(todos)
					.where(and(mine.todos, eq(todos.id, id)))
					.returning();
				return row ? bare(row) : null;
			},
			async restore(todo) {
				await db
					.insert(todos)
					.values({ ...todo, email })
					.onConflictDoNothing();
			}
		},

		flow: {
			async day(date) {
				const rows = await db
					.select()
					.from(flowLog)
					.where(and(mine.flow, eq(flowLog.date, date)))
					.orderBy(asc(flowLog.at), asc(flowLog.id));
				return rows.map(bare);
			},
			async all() {
				const rows = await db
					.select()
					.from(flowLog)
					.where(mine.flow)
					.orderBy(asc(flowLog.at), asc(flowLog.id));
				return rows.map(bare);
			},
			async insert(row) {
				const [inserted] = await db
					.insert(flowLog)
					.values({
						at: row.at,
						date: row.date,
						type: row.type,
						todoId: row.todoId ?? null,
						taskId: row.taskId ?? null,
						data: row.data ?? {},
						key: row.key ?? null,
						email
					})
					.onConflictDoNothing()
					.returning();
				return inserted ? bare(inserted) : null;
			},
			async prune(before) {
				await db.delete(flowLog).where(and(mine.flow, lt(flowLog.at, before)));
			}
		},

		actions: {
			async record(action) {
				const [row] = await db
					.insert(agentActions)
					.values({ ...action, email, createdAt: action.createdAt ?? Date.now() })
					.returning({ id: agentActions.id });
				return row.id;
			},
			async get(id) {
				const [row] = await db
					.select()
					.from(agentActions)
					.where(and(mine.actions, eq(agentActions.id, id)));
				return row ? asAction(row) : null;
			},
			async markUndone(id, at) {
				await db
					.update(agentActions)
					.set({ undoneAt: at })
					.where(and(mine.actions, eq(agentActions.id, id)));
			},
			async recent(limit) {
				const rows = await db
					.select()
					.from(agentActions)
					.where(mine.actions)
					.orderBy(desc(agentActions.id))
					.limit(limit);
				return rows.map(asAction);
			},
			async latestId() {
				const [row] = await db
					.select({ id: agentActions.id })
					.from(agentActions)
					.where(mine.actions)
					.orderBy(desc(agentActions.id))
					.limit(1);
				return row?.id ?? 0;
			},
			async ownSince(id) {
				const rows = await db
					.select()
					.from(agentActions)
					.where(
						and(
							mine.actions,
							gt(agentActions.id, id),
							isNotNull(agentActions.eventId),
							isNull(agentActions.undoneAt)
						)
					)
					.orderBy(asc(agentActions.id));
				return rows.map(asAction);
			},
			async anySince(at) {
				const [row] = await db
					.select({ id: agentActions.id })
					.from(agentActions)
					.where(and(mine.actions, gt(agentActions.createdAt, at)))
					.limit(1);
				return !!row;
			}
		},

		events: {
			async insert(event) {
				const [row] = await db
					.insert(events)
					.values({
						type: event.type,
						payload: event.payload,
						origin: event.origin,
						key: event.key ?? null,
						createdAt: event.createdAt,
						handledAt: event.handledAt ?? null,
						outcome: event.outcome ?? null,
						email
					})
					.onConflictDoNothing()
					.returning({ id: events.id });
				return row?.id ?? null;
			},
			unhandled() {
				return db
					.select()
					.from(events)
					.where(and(mine.events, isNull(events.handledAt)))
					.orderBy(asc(events.id));
			},
			async settle(ids, outcome, at) {
				if (ids.length === 0) return;
				await db
					.update(events)
					.set({ handledAt: at, outcome })
					.where(and(mine.events, inArray(events.id, ids)));
			},
			recent(limit) {
				return db.select().from(events).where(mine.events).orderBy(desc(events.id)).limit(limit);
			},
			async knownKeys(keys) {
				if (keys.length === 0) return new Set();
				const rows = await db
					.select({ key: events.key })
					.from(events)
					.where(and(mine.events, inArray(events.key, keys)));
				return new Set(rows.flatMap((row) => (row.key === null ? [] : [row.key])));
			},
			async prune(before) {
				await db
					.delete(events)
					.where(and(mine.events, isNotNull(events.handledAt), lt(events.createdAt, before)));
			}
		},

		cards: {
			async open() {
				const [row] = await db
					.select()
					.from(agentCards)
					.where(and(mine.cards, isNull(agentCards.resolvedAt)))
					.orderBy(desc(agentCards.id))
					.limit(1);
				return row ?? null;
			},
			async show(card) {
				await db
					.update(agentCards)
					.set({ resolvedAt: card.createdAt })
					.where(and(mine.cards, isNull(agentCards.resolvedAt)));
				const [row] = await db
					.insert(agentCards)
					.values({
						kind: card.kind,
						text: card.text,
						options: card.options?.length ? card.options : null,
						eventId: card.eventId ?? null,
						createdAt: card.createdAt,
						email
					})
					.returning();
				return row;
			},
			async resolve(id, at) {
				const done = await db
					.update(agentCards)
					.set({ resolvedAt: at })
					.where(and(mine.cards, eq(agentCards.id, id), isNull(agentCards.resolvedAt)))
					.returning({ id: agentCards.id });
				return done.length > 0;
			},
			async prune(before) {
				await db
					.delete(agentCards)
					.where(
						and(mine.cards, isNotNull(agentCards.resolvedAt), lt(agentCards.createdAt, before))
					);
			}
		},

		schedule: {
			pending() {
				return db
					.select()
					.from(schedule)
					.where(and(mine.schedule, eq(schedule.status, 'pending')))
					.orderBy(asc(schedule.fireAt));
			},
			due(nowMs) {
				return db
					.select()
					.from(schedule)
					.where(
						and(
							mine.schedule,
							eq(schedule.status, 'pending'),
							eq(schedule.enabled, true),
							lte(schedule.fireAt, nowMs)
						)
					)
					.orderBy(asc(schedule.fireAt));
			},
			async insert(entry) {
				const [row] = await db
					.insert(schedule)
					.values({ ...entry, email })
					.returning();
				return row;
			},
			async update(id, patch) {
				await db
					.update(schedule)
					.set(patch)
					.where(and(mine.schedule, eq(schedule.id, id)));
			},
			async cancel(id) {
				const [row] = await db
					.update(schedule)
					.set({ status: 'cancelled' })
					.where(and(mine.schedule, eq(schedule.id, id), eq(schedule.status, 'pending')))
					.returning();
				return row ?? null;
			},
			async prune(before) {
				await db
					.delete(schedule)
					.where(
						and(
							mine.schedule,
							inArray(schedule.status, ['done', 'cancelled']),
							lt(schedule.fireAt, before)
						)
					);
			}
		},

		usage: {
			async record(use, tokens, at) {
				await db.insert(aiUsage).values({ email, use, tokens, createdAt: at });
			},
			async tokensSince(since) {
				const [row] = await db
					.select({ total: sql<number>`coalesce(sum(${aiUsage.tokens}), 0)` })
					.from(aiUsage)
					.where(and(mine.usage, gte(aiUsage.createdAt, since)));
				return row?.total ?? 0;
			},
			async countSince(use, since) {
				const [row] = await db
					.select({ total: sql<number>`count(*)` })
					.from(aiUsage)
					.where(and(mine.usage, eq(aiUsage.use, use), gte(aiUsage.createdAt, since)));
				return row?.total ?? 0;
			},
			async timesSince(use, since) {
				const rows = await db
					.select({ at: aiUsage.createdAt })
					.from(aiUsage)
					.where(and(mine.usage, eq(aiUsage.use, use), gte(aiUsage.createdAt, since)));
				return rows.map((row) => row.at);
			},
			async prune(before) {
				await db.delete(aiUsage).where(and(mine.usage, lt(aiUsage.createdAt, before)));
			}
		},

		settings: {
			async get() {
				const [row] = await db.select().from(users).where(eq(users.email, email));
				if (!row) throw new Error(`no user ${email}`);
				return settingsOf(row);
			},
			async update(patch) {
				if (Object.keys(patch).length > 0)
					await db.update(users).set(patch).where(eq(users.email, email));
				return this.get();
			}
		}
	};
}

/** The row without its owner: a to-do or a flow row on its own never says whose it is. */
const bare = <T extends { email: string }>({ email: _email, ...row }: T): Omit<T, 'email'> => row;

const asAction = (row: typeof agentActions.$inferSelect) => ({
	id: row.id,
	tool: row.tool,
	before: row.before as Task | null,
	after: row.after as Task | null,
	eventId: row.eventId,
	reason: row.reason,
	createdAt: row.createdAt,
	undoneAt: row.undoneAt
});
