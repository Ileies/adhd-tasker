import { tasker, type Alarm } from '#lib/app.svelte.js';
import { startRinging } from '#lib';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import type { AlarmFields } from '#lib/backend.js';

const DEVICE_KEY = 'tasker.device';
/** An alarm whose time passed while the tab slept still rings if it is this recent. */
const CATCH_UP_MS = 60_000;
/** setTimeout can not wait longer than about 24 days. */
const MAX_WAIT_MS = 2_000_000_000;

/** Stable id of this browser, so the user can choose which device plays sound. Only a per-device convenience. */
export function deviceId(): string {
	try {
		const stored = localStorage.getItem(DEVICE_KEY);
		if (stored) return stored;
		const id = crypto.randomUUID();
		localStorage.setItem(DEVICE_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}

/** Only the display device makes sound, the others show the alarm silently. With no display device chosen every device plays. */
export const playsSound = () =>
	tasker.device.display === null || tasker.device.display === tasker.device.id;

const rung = new Set<string>();
let timers: ReturnType<typeof setTimeout>[] = [];
let stopRinging: (() => void) | undefined;

/**
 * Rings one alarm instance, whichever path (own timer or the stream) gets there first. The sound loops without
 * pauses and gets louder until it is dismissed or its duration is over, the banner stays until it is dismissed.
 */
export function ring(
	alarm: Pick<Alarm, 'id' | 'fireAt' | 'label' | 'tone'> & { durationMin?: number }
) {
	const key = `${alarm.id}@${alarm.fireAt}`;
	if (rung.has(key)) return;
	rung.add(key);

	tasker.schedule.ringing = { id: alarm.id, label: alarm.label };
	stopRinging?.();
	stopRinging = playsSound()
		? startRinging(alarm.tone, (alarm.durationMin ?? SCHEDULE_LIMITS.defaultAlarmMinutes) * 60_000)
		: undefined;
	// The server moves a repeating alarm on and retires a one-off, fetch the list again once it has
	setTimeout(() => void loadSchedule().catch(() => {}), 20_000);
}

export function dismissAlarm() {
	stopRinging?.();
	stopRinging = undefined;
	tasker.schedule.ringing = null;
}

/** Keeps the next alarms in local timers, so a dropped stream or a slow server tick does not delay them. */
function arm() {
	timers.forEach(clearTimeout);
	timers = [];
	const now = Date.now();
	for (const alarm of tasker.schedule.alarms) {
		const wait = alarm.fireAt - now;
		if (wait <= 0 && wait > -CATCH_UP_MS) ring(alarm);
		else if (wait > 0 && wait < MAX_WAIT_MS) timers.push(setTimeout(() => ring(alarm), wait));
	}
}

export async function loadSchedule() {
	const body = await tasker.backend.schedule.load();
	if (!body) return;
	tasker.schedule.alarms = body.alarms;
	tasker.schedule.wakeups = body.wakeups;
	tasker.schedule.loaded = true;
	arm();
}

/** `at` is a clock time for a daily or one-off alarm, `in_minutes` a timer from now (it cannot repeat). Returns why it failed. */
export async function addAlarm(fields: AlarmFields): Promise<string | null> {
	try {
		await tasker.backend.schedule.addAlarm(fields);
	} catch (error) {
		return error instanceof Error ? error.message : 'Could not save the alarm';
	}
	await loadSchedule();
	return null;
}

export async function removeEntry(id: number) {
	await tasker.backend.schedule.remove(id);
	await loadSchedule();
}

/** `null` lets every device play again. */
export const chooseDisplay = (device: string | null) =>
	tasker.backend.schedule.chooseDisplay(device);
