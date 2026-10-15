import type { Settings } from '#lib/core/repo.js';

/**
 * What a new user starts with. The `users` table takes its column defaults from here and the repo on a
 * guest's device returns it before anything was saved, so a new guest and a new account are identical.
 */
export const DEFAULT_SETTINGS: Settings = {
	enableReminders: true,
	reminderAdvanceTime: 15, // minutes before the next task starts
	hyperfocusAlarm: true, // a tone when a task runs past its end
	overrunMinutes: 15, // how long past its end counts as an overrun
	darkMode: false,
	openaiKey: null,
	timezone: null, // IANA name, null until first set
	googleServices: '',
	aiAutonomy: 'suggest',
	aiEvents: 'task.completed task.missed task.overrun',
	quietStart: 1320, // 22:00, no unprompted reactions from here
	quietEnd: 420, // 07:00
	dailyTokenBudget: null, // no limit for unprompted reactions
	lastCurrentTaskId: null, // never tracked
	displayDevice: null, // every device plays
	voiceReplies: false,
	showClock: false,
	clock12h: null, // null follows the device's own 12 or 24 hour setting until the user picks one
	checkInMinutes: 5, // soft chime while a task is current, 0 is off
	myDayStart: 420, // 07:00, the timeline folds the hours outside My day
	myDayEnd: 1380 // 23:00
};
