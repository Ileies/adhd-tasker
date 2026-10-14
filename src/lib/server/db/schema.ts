import { Priority, TaskStatus } from '../../types';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	email: text('email').notNull().primaryKey(),
	enableReminders: integer('enable_reminders', { mode: 'boolean' }).default(true).notNull(),
	reminderAdvanceTime: integer('reminder_advance_time').default(15).notNull(), // minutes before
	enableOverdueNotifications: integer('enable_overdue_notifications', { mode: 'boolean' }).default(true).notNull(),
	enableFocusMode: integer('enable_focus_mode', { mode: 'boolean' }).default(false).notNull(),
	darkMode: integer('dark_mode', { mode: 'boolean' }).default(false).notNull(),
	openaiKey: text('openai_key'),
	timezone: text('timezone'), // IANA name, null until first set
	googleServices: text('google_services').default('').notNull() // linked Google services, space separated (see #lib/google)
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
	createdAt: integer('created_at').notNull(), // ms since epoch
	undoneAt: integer('undone_at')
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id')
		.references(() => tasks.id, { onDelete: 'cascade' })
		.notNull(),
	reminderTime: integer('reminder_time').notNull()
});
