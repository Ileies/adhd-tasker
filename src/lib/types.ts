import type { Task } from '#lib/core/repo.js';
import type { reminders } from '#lib/server/db/schema.js';

export enum Priority {
	Low = 1,
	Medium = 2,
	High = 3,
	Urgent = 4,
	Critical = 5
}

export enum TaskStatus {
	Pending = 'pending',
	Active = 'active',
	Completed = 'completed',
	Overdue = 'overdue'
}

export interface TaskForm {
	selectedTask?: Task; // For editing existing tasks
	isEditing: boolean; // True if editing an existing task
	showTaskForm: boolean; // Controls visibility of the task form
	title: string;
	description: string;
	date: string; // YYYY-MM-DD
	duration: number; // Duration in minutes
	startTime: number; // Start time in seconds since start of the day
	priority: Priority; // Priority level
}

export type { Task };
export type Reminder = typeof reminders.$inferSelect;
