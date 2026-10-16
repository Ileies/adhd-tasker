import { tasker } from '#lib/app.svelte.js';
import { loadDay, playTone } from '#lib';
import { pollAgent } from '#lib/agent.js';
import { deviceId, loadSchedule, playsSound, ring } from '#lib/alarms.js';
import { refreshAfterImport } from '#lib/data.js';
import { loadFlow, loadTodos } from '#lib/todos.js';
import { showToast } from '#lib/toast.js';
import type { Tone } from '#lib/tones.js';

/** While the stream is down the agent feed is polled slowly, so the screen still catches up. */
const FALLBACK_POLL_MS = 30_000;

interface Message {
	type: string;
	id?: number;
	fireAt?: number;
	label?: string;
	tone?: Tone;
	durationMin?: number;
	device?: string | null;
	/** What to tell the user about Google Calendar. */
	message?: string;
	/** The days another tab of a guest's device changed. */
	dates?: string[];
}

/** What a hint means for this screen. The server stream and the tabs of a guest's device both end up here. */
export function handleHint(message: Message) {
	switch (message.type) {
		case 'plan':
			for (const date of message.dates ?? []) void loadDay(date).catch(() => {});
			return;
		case 'reload':
			// Another tab deleted the device's data: start again from the empty database
			return location.reload();
		case 'agent':
			return void pollAgent().catch(() => {});
		case 'todos':
			return void loadTodos().catch(() => {});
		case 'flow':
			return void loadFlow().catch(() => {});
		case 'schedule':
			return void loadSchedule().catch(() => {});
		case 'alarm':
			return ring({
				id: message.id!,
				fireAt: message.fireAt!,
				label: message.label ?? '',
				tone: message.tone!,
				durationMin: message.durationMin
			});
		case 'tone':
			if (playsSound()) playTone(message.tone!);
			return;
		case 'calendar':
			// Google had the last word on a task: the plan is read again, and the user is told why it moved
			showToast(message.message ?? '');
			return void refreshAfterImport().catch(() => {});
		case 'display':
			tasker.device.display = message.device ?? null;
	}
}

/**
 * Opens the event stream and keeps it open (the browser reconnects by itself). Everything it delivers is a hint:
 * on every (re)connect and when the page becomes visible the client fetches what it may have missed.
 * Returns the cleanup for an effect.
 */
export function startStream() {
	tasker.device.id = deviceId();
	const source = new EventSource(`/stream?device=${encodeURIComponent(tasker.device.id)}`);

	const catchUp = () => {
		if (document.hidden) return;
		pollAgent().catch(() => {});
		loadSchedule().catch(() => {});
		loadTodos().catch(() => {});
		loadFlow().catch(() => {});
	};

	source.onopen = () => {
		tasker.device.streaming = true;
		catchUp();
	};
	source.onerror = () => {
		tasker.device.streaming = false;
	};
	source.onmessage = (event) => {
		try {
			handleHint(JSON.parse(event.data));
		} catch {
			// a malformed push is not worth anything, the next fetch is the truth
		}
	};

	const timer = setInterval(() => {
		if (!tasker.device.streaming && !document.hidden) pollAgent().catch(() => {});
	}, FALLBACK_POLL_MS);
	document.addEventListener('visibilitychange', catchUp);

	return () => {
		source.close();
		clearInterval(timer);
		document.removeEventListener('visibilitychange', catchUp);
		tasker.device.streaming = false;
	};
}
