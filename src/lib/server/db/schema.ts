import { Priority, TaskStatus } from '../../types';
import type { EventOrigin, EventType } from '../../events';
import type { Autonomy } from '../../guardrails';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	email: text('email').notNull().primaryKey(),
	enableReminders: integer('enable_reminders', { mode: 'boolean' }).default(true).notNull(),
	reminderAdvanceTime: integer('reminder_advance_time').default(15).notNull(), // minutes before
	enableOverdueNotifications: integer('enable_overdue_notifications', { mode: 'boolean' }).default(true).notNull(),
	enableFocusMode: integer('enable_focus_mode', { mode: 'boolean' }).default(false).notNull(),
	darkMode: integer('dark_mode', { mode: 'boolean' }).default(false).notNull(),
	openaiKey: text('openai_key'),
	timezone: text('timezone'), // IANA name, null until first set
	googleServices: text('google_services').default('').notNull(), // linked Google services, space separated (see #lib/google)
	aiAutonomy: text('ai_autonomy').$type<Autonomy>().default('suggest').notNull(),
	aiEvents: text('ai_events').default('task.completed task.missed task.overrun').notNull(), // event types the agent may react to, space separated
	quietStart: integer('quiet_start').default(1320).notNull(), // minutes since midnight, no unprompted reactions from here
	quietEnd: integer('quiet_end').default(420).notNull(), // until here
	dailyTokenBudget: integer('daily_token_budget'), // null: no limit for unprompted reactions
	lastCurrentTaskId: integer('last_current_task_id') // what the scheduler saw as current at its last tick, to detect task.switched
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	date: text('date').notNull(), // YYYY-MM-DD in the user's timezone
	startTime: integer('start_time').notNull(),
	duration: integer('duration').notNull(),
	priority: integer('priority').$type<Priority>().default(Priority.Medium).notNull(),
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending).notNull()
});

/** Every change the assistant made to the plan, with enough to undo it. `before`/`after` are task JSON, null when absent. */
export const agentActions = sqliteTable('agent_actions', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	tool: text('tool').notNull(), // add_task | update_task | delete_task
	before: text('before', { mode: 'json' }),
	after: text('after', { mode: 'json' }),
	eventId: integer('event_id'), // the event the agent reacted to, null for changes made while chatting
	reason: text('reason'), // why, in the agent's words, shown in the activity log
	createdAt: integer('created_at').notNull(), // ms since epoch
	undoneAt: integer('undone_at')
});

/** Everything the agent can observe. Handled events are done, `outcome` says what became of them. */
export const events = sqliteTable(
	'events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
		email: text('email')
			.references(() => users.email, { onDelete: 'cascade' })
			.notNull(),
		type: text('type').$type<EventType>().notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		origin: text('origin').$type<EventOrigin>().notNull(),
		key: text('key'), // detected events only: one row per fact
		createdAt: integer('created_at').notNull(), // ms since epoch
		handledAt: integer('handled_at'),
		outcome: text('outcome')
	},
	(table) => [uniqueIndex('events_email_key').on(table.email, table.key)]
);

/** What the agent said or asked, shown in the strip on the Now screen until it is resolved. */
export const agentCards = sqliteTable('agent_cards', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	kind: text('kind').$type<'say' | 'ask'>().notNull(),
	text: text('text').notNull(),
	options: text('options', { mode: 'json' }).$type<string[]>(), // answers offered by an ask
	eventId: integer('event_id'),
	createdAt: integer('created_at').notNull(),
	resolvedAt: integer('resolved_at')
});

/** Tokens of every model call, for the daily meter and the budget. */
export const aiUsage = sqliteTable('ai_usage', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	use: text('use').notNull(), // chat | reaction | replan
	tokens: integer('tokens').notNull(),
	createdAt: integer('created_at').notNull()
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id')
		.references(() => tasks.id, { onDelete: 'cascade' })
		.notNull(),
	reminderTime: integer('reminder_time').notNull()
});
