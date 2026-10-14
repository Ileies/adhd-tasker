import { tasker, type ChatEntry } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import { loadDay, showToast } from '#lib';
import { speak, stopSpeaking } from '#lib/speech.js';

type Change = NonNullable<ChatEntry['changes']>[number];

async function refresh(dates: string[]) {
	await Promise.all([...new Set(dates)].map((date) => loadDay(date).catch(() => {})));
}

/** Sends the conversation, shows the reply and brings the plan up to date. */
export async function sendMessage(text: string) {
	const chat = tasker.assistant;
	if (chat.busy || !text.trim()) return;

	stopSpeaking();
	chat.messages.push({ role: 'user', content: text.trim() });
	chat.busy = true;
	try {
		const { reply, changes } = await tasker.backend.assistant.chat(
			chat.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))
		);
		chat.messages.push({
			role: 'assistant',
			content: reply,
			changes: changes.length ? changes : undefined
		});
		if (tasker.voice.replies) void speak(reply);
		if (changes.length) {
			await refresh(changes.flatMap((c) => c.dates));
			showToast(
				changes.length === 1 ? changes[0].summary : `Assistant made ${changes.length} changes`,
				() => undoAll(changes)
			);
		}
	} catch (error) {
		chat.messages.push({
			role: 'assistant',
			content:
				error instanceof BackendError ? error.message : 'The assistant is not available right now.',
			error: true
		});
	} finally {
		chat.busy = false;
	}
}

/** Reverts one change the assistant made. */
export async function undoChange(change: Change) {
	if (change.undone) return;
	let dates: string[];
	try {
		({ dates } = await tasker.backend.assistant.undo(change.id));
	} catch (error) {
		if (!(error instanceof BackendError) || error.status === null) throw error;
		showToast(
			error.status === 409
				? 'Already undone'
				: `Could not undo that change${error.message ? `: ${error.message}` : ''}`
		);
		return;
	}
	change.undone = true;
	await refresh(dates);
}

/** Newest first, so later changes to the same task are reverted before earlier ones. */
async function undoAll(changes: Change[]) {
	const live = tasker.assistant.messages.flatMap((m) => m.changes ?? []);
	for (const change of [...changes].reverse()) {
		const entry = live.find((c) => c.id === change.id);
		if (entry) await undoChange(entry);
	}
}
