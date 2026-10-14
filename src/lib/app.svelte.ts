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
	dayStart: number; // minutes since midnight, daytime theme starts
	dayEnd: number; // minutes since midnight, daytime theme ends
	timezone: string | null; // IANA name from the user's settings, null until set
} = $state({
	tasks: [],
	activeTask: null,
	isFullScreen: false,
	timeLeft: 0,
	isMuted: false,
	volume: 100,
	themeMode: 'auto',
	dayStart: 420,
	dayEnd: 1140,
	timezone: null
});
