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
	lastCurrentKey: null, // never tracked
	displayDevice: null, // every device plays
	voiceReplies: false,
	openaiTranscribe: true, // with a key, speech to text goes to OpenAI, off uses the browser's own to save cost
	voiceLanguage: null, // null: the microphone listens in the browser's language
	showClock: false,
	clock12h: null, // null follows the device's own 12 or 24 hour setting until the user picks one
	checkInMinutes: 5, // soft chime while a task is current, 0 is off
	myDayStart: 420, // 07:00, the timeline folds the hours outside My day
	myDayEnd: 1380, // 23:00
	checkMinutes: 30, // a session on a to-do runs this long, then the app asks how far it is
	breakMinutes: 10, // a break the app starts or the user asks for
	arriveEarlyMinutes: 10, // travel ends this long before its appointment
	startWorkAt: 540, // 09:00, the morning call until the user taps Start
	locationLat: null, // no location: the theme follows the main city of the timezone
	locationLon: null,
	locationName: null,
	locationSource: null // null: an account finds it from the internet address, a guest has none
};
