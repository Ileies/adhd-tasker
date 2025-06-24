import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: integer('id').primaryKey(),
	age: integer('age')
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey(),
	title: integer('title'),
	description: integer('description'),
	userId: integer('user_id').references(() => user.id, { onDelete: 'cascade' }),
	startTime: integer('start_time'),
	endTime: integer('end_time'),
	priority: integer('priority').$type<1|2|3|4|5>().default(3)
});

export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey(),
	taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
	reminderTime: integer('reminder_time')
});

