import { type Task } from './types';
import type { Repeat } from './schedule';
import type { Tone } from './tones';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Toast {
	message: string;
	/** Reverts the action the toast reports, the toast offers an Undo button when set. */
	undo?: () => void;
}

export interface ChatEntry {
	role: 'user' | 'assistant';
	content: string;
	/** Plan changes made while answering, each can be undone. */
	changes?: { id: number; summary: string; dates: string[]; undone?: boolean }[];
	error?: boolean;
}

/** A note or question the agent put on the Now screen. */
export interface AgentCard {
	id: number;
	kind: 'say' | 'ask';
	text: string;
	options: string[];
}

/** An alarm as the client keeps it, so it still rings when the stream is down for a moment. */
export interface Alarm {
	id: number;
	fireAt: number;
	label: string;
	tone: Tone;
	repeat: Repeat;
	createdBy: 'user' | 'agent';
}

export interface Wakeup {
	id: number;
	fireAt: number;
	note: string;
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
	assistant: { open: boolean; busy: boolean; messages: ChatEntry[] }; // the chat lives for this page session only
	agent: { cards: AgentCard[]; cursor: number | null }; // cursor: last agent action id seen, null before the first poll
	schedule: { alarms: Alarm[]; wakeups: Wakeup[]; ringing: { id: number; label: string } | null; loaded: boolean };
	device: { id: string; display: string | null; streaming: boolean }; // display: the device that plays sound, null means every device
} = $state({
	tasks: [],
	isMuted: false,
	volume: 100,
	themeMode: 'auto',
	dayStart: 420,
	dayEnd: 1140,
	timezone: null,
	toast: null,
	assistant: { open: false, busy: false, messages: [] },
	agent: { cards: [], cursor: null },
	schedule: { alarms: [], wakeups: [], ringing: null, loaded: false },
	device: { id: '', display: null, streaming: false }
});
