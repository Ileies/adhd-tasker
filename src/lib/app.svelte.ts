import { type Task } from './types';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Toast {
	message: string;
	/** Reverts the action the toast reports, the toast offers an Undo button when set. */
	undo?: () => void;
}

export const tasker: {
	tasks: Task[];
	isMuted: boolean;
	volume: number; // 0-100
	themeMode: ThemeMode;
	dayStart: number; // minutes since midnight, daytime theme starts
	dayEnd: number; // minutes since midnight, daytime theme ends
	timezone: string | null; // IANA name from the user's settings, null until set
	toast: Toast | null;
} = $state({
	tasks: [],
	isMuted: false,
	volume: 100,
	themeMode: 'auto',
	dayStart: 420,
	dayEnd: 1140,
	timezone: null,
	toast: null
});
