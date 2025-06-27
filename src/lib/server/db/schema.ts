import { Priority, TaskStatus } from '../../types';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	email: text('email').notNull().primaryKey(),
	resetTime: integer('reset_time').default(0).notNull() // day time to reset the tasks
	// Further settings can be added here
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	email: text('email').references(() => users.email, { onDelete: 'cascade' }).notNull(),
	startTime: integer('start_time').notNull(),
	duration: integer('duration').notNull(),
	priority: integer('priority').$type<Priority>().default(Priority.Medium).notNull(),
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending).notNull()
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
	reminderTime: integer('reminder_time').notNull()
});

