import type { Task, TaskKind } from '#lib/core/repo.js';

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
	kind: TaskKind; // block (a task of the user's own), appointment or travel
	shift: number; // minutes a block may move to make room for an appointment, 0 stays
}

export type { Task };
