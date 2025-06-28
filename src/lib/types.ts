import type { reminders, tasks } from '$lib/server/db/schema';

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
	duration: number; // Duration in minutes
	startTime: Date; // Start time as a Date object
	priority: Priority; // Priority level
}

export type Task = typeof tasks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
