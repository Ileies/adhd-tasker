import { type Task } from './types';

export const tasker: {
	tasks: Task[];
	activeTask: Task | null;
	isFullScreen: boolean;
	timeLeft: number;
	isMuted: boolean;
} = $state({
	tasks: [],
	activeTask: null,
	isFullScreen: false,
	timeLeft: 0,
	isMuted: false
});
