import { type Task, TaskStatus } from './types';

export const taskState: {
	tasks: Task[];
	activeTask: Task | null;
	isFullScreen: boolean;
	timeLeft: number;
} = $state({
	tasks: [],
	activeTask: null,
	isFullScreen: false,
	timeLeft: 0
});

export const activeTasks = $derived(taskState.tasks.filter((task) => {
	const now = Math.floor(Date.now() / 1000);
	const taskStart = task.startTime || 0;
	const taskEnd = taskStart + (task.duration) * 60;
	return task.status === TaskStatus.Pending && taskStart <= now && now < taskEnd;
}));
