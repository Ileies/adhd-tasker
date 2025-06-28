import { type Task } from './types';

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
