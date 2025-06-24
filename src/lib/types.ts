import type { tasks } from '$lib/server/db/schema';

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

export type Task = typeof tasks.$inferSelect;

export interface TaskFormData {
	title: string;
	description: string;
	time: string;
	date: string;
	priority: Priority;
	duration?: number;
}
