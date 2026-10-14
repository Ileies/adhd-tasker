import { tasker, type ChatEntry } from '#lib/app.svelte.js';
import { loadDay, showToast } from '#lib';

type Change = NonNullable<ChatEntry['changes']>[number];

async function refresh(dates: string[]) {
	await Promise.all([...new Set(dates)].map((date) => loadDay(date).catch(() => {})));
}

/** Sends the conversation, shows the reply and brings the plan up to date. */
export async function sendMessage(text: string) {
	const chat = tasker.assistant;
	if (chat.busy || !text.trim()) return;

	chat.messages.push({ role: 'user', content: text.trim() });
	chat.busy = true;
	try {
		const response = await fetch('/assistant', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: chat.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) })
		});
		if (!response.ok) {
			const detail = await response.json().catch(() => null);
			chat.messages.push({ role: 'assistant', content: detail?.message ?? 'The assistant is not available right now.', error: true });
			return;
		}

		const { reply, changes }: { reply: string; changes: Change[] } = await response.json();
		chat.messages.push({ role: 'assistant', content: reply, changes: changes.length ? changes : undefined });
		if (changes.length) {
			await refresh(changes.flatMap((c) => c.dates));
			showToast(changes.length === 1 ? changes[0].summary : `Assistant made ${changes.length} changes`, () => undoAll(changes));
		}
	} catch {
		chat.messages.push({ role: 'assistant', content: 'Could not reach the server.', error: true });
	} finally {
		chat.busy = false;
	}
}

/** Reverts one change the assistant made. */
export async function undoChange(change: Change) {
	if (change.undone) return;
	const response = await fetch('/assistant/undo', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id: change.id })
	});
	if (!response.ok) {
		showToast(response.status === 409 ? 'Already undone' : 'Could not undo that change');
		return;
	}
	change.undone = true;
	await refresh((await response.json()).dates);
}

/** Newest first, so later changes to the same task are reverted before earlier ones. */
async function undoAll(changes: Change[]) {
	const live = tasker.assistant.messages.flatMap((m) => m.changes ?? []);
	for (const change of [...changes].reverse()) {
		const entry = live.find((c) => c.id === change.id);
		if (entry) await undoChange(entry);
	}
}
