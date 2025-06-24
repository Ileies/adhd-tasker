import { Priority, TaskStatus } from '$lib/types';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	token: text('token').notNull(),
	resetTime: integer('reset_time').default(0) // day time to reset the tasks
	// Further settings can be added here
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title'),
	description: text('description'),
	userId: integer('user_id').references(() => user.id, { onDelete: 'cascade' }),
	startTime: integer('start_time'),
	duration: integer('duration'),
	priority: integer('priority').$type<Priority>().default(Priority.Medium),
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending)
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
	reminderTime: integer('reminder_time')
});

