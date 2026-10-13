import { type Task } from './types';

export type ThemeMode = 'light' | 'dark' | 'auto';

export const tasker: {
	tasks: Task[];
	activeTask: Task | null;
	isFullScreen: boolean;
	timeLeft: number;
	isMuted: boolean;
	volume: number; // 0-100
	themeMode: ThemeMode;
} = $state({
	tasks: [],
	activeTask: null,
	isFullScreen: false,
	timeLeft: 0,
	isMuted: false,
	volume: 100,
	themeMode: 'auto'
});
