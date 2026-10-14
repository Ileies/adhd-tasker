import { tasker, type Alarm } from '#lib/app.svelte.js';
import { playTone } from '#lib';
import type { Repeat } from '#lib/schedule.js';
import type { ToneName } from '#lib/tones.js';

const DEVICE_KEY = 'tasker.device';
/** An alarm whose time passed while the tab slept still rings if it is this recent. */
const CATCH_UP_MS = 60_000;
/** A ringing alarm sounds again while nobody dismissed it, in case the first tone was missed. */
const REPLAY_MS = 30_000;
const MAX_REPLAYS = 3;
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
let replay: ReturnType<typeof setTimeout> | undefined;

/** Rings one alarm instance once, whichever path (own timer or the stream) gets there first. */
export function ring(alarm: Pick<Alarm, 'id' | 'fireAt' | 'label' | 'tone'>) {
	const key = `${alarm.id}@${alarm.fireAt}`;
	if (rung.has(key)) return;
	rung.add(key);

	tasker.schedule.ringing = { id: alarm.id, label: alarm.label };
	let replays = 0;
	const sound = () => {
		if (!tasker.schedule.ringing || tasker.schedule.ringing.id !== alarm.id) return;
		if (playsSound()) playTone(alarm.tone);
		if (replays++ < MAX_REPLAYS) replay = setTimeout(sound, REPLAY_MS);
	};
	clearTimeout(replay);
	sound();
	// The server moves a repeating alarm on and retires a one-off, fetch the list again once it has
	setTimeout(() => void loadSchedule().catch(() => {}), 20_000);
}

export function dismissAlarm() {
	clearTimeout(replay);
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
	const response = await fetch('/schedule');
	if (!response.ok) return;
	const body = await response.json();
	tasker.schedule.alarms = body.alarms;
	tasker.schedule.wakeups = body.wakeups;
	tasker.schedule.loaded = true;
	arm();
}

/** `at` is a clock time for a daily or one-off alarm, `in_minutes` a timer from now (it cannot repeat). */
export async function addAlarm(fields: {
	at?: string;
	in_minutes?: number;
	label: string;
	tone: ToneName;
	repeat: Repeat;
}): Promise<string | null> {
	const response = await fetch('/schedule', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(fields)
	});
	if (!response.ok)
		return (await response.json().catch(() => null))?.message ?? 'Could not save the alarm';
	await loadSchedule();
	return null;
}

export async function removeEntry(id: number) {
	await fetch(`/schedule/${id}`, { method: 'DELETE' });
	await loadSchedule();
}

/** `null` lets every device play again. */
export async function chooseDisplay(device: string | null) {
	await fetch('/schedule/display', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ device })
	});
}
