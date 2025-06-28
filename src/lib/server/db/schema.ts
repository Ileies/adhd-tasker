import { Priority, TaskStatus } from '../../types';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	email: text('email').notNull().primaryKey(),
	enableReminders: integer('enable_reminders', { mode: 'boolean' }).default(true).notNull(),
	reminderAdvanceTime: integer('reminder_advance_time').default(15).notNull(), // minutes before
	enableOverdueNotifications: integer('enable_overdue_notifications', { mode: 'boolean' }).default(true).notNull(),
	enableFocusMode: integer('enable_focus_mode', { mode: 'boolean' }).default(false).notNull(),
	darkMode: integer('dark_mode', { mode: 'boolean' }).default(false).notNull(),
	openaiKey: text('openai_key').notNull(),
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	startTime: integer('start_time').notNull(),
	duration: integer('duration').notNull(),
	priority: integer('priority').$type<Priority>().default(Priority.Medium).notNull(),
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending).notNull()
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id')
		.references(() => tasks.id, { onDelete: 'cascade' })
		.notNull(),
	reminderTime: integer('reminder_time').notNull()
});
