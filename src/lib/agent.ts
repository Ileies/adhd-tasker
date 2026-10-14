import { tasker, type AgentCard } from '#lib/app.svelte.js';
import { loadDay, showToast } from '#lib';
import { sendMessage, undoChange } from '#lib/assistant.js';

const POLL_MS = 15_000;

interface Feed {
	cursor: number;
	cards: AgentCard[];
	changes: { id: number; summary: string; dates: string[] }[];
}

/** Fetches what the agent did on its own: refreshes the plan, offers Undo for its edits and fills the strip on Now. */
export async function pollAgent() {
	const since = tasker.agent.cursor;
	const response = await fetch(since === null ? '/agent' : `/agent?since=${since}`);
	if (!response.ok) return;
	const feed: Feed = await response.json();

	tasker.agent.cursor = feed.cursor;
	tasker.agent.cards = feed.cards;

	if (feed.changes.length) {
		await Promise.all([...new Set(feed.changes.flatMap((change) => change.dates))].map((date) => loadDay(date).catch(() => {})));
		const changes = feed.changes.map((change) => ({ ...change, undone: false }));
		showToast(changes.length === 1 ? changes[0].summary : `Assistant made ${changes.length} changes`, async () => {
			// Newest first, so later changes to the same task are reverted before earlier ones
			for (const change of [...changes].reverse()) await undoChange(change);
		});
	}
}

/** Polls while the page is visible. Returns the stop function for an effect cleanup. */
export function startAgentPolling() {
	const run = () => {
		if (!document.hidden) pollAgent().catch(() => {});
	};
	run();
	const timer = setInterval(run, POLL_MS);
	document.addEventListener('visibilitychange', run);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', run);
	};
}

/**
 * Resolves a card. An answer continues in the chat: the question becomes the assistant's last message,
 * the chosen option the user's reply, so the assistant has the context and can act on a yes.
 */
export async function resolveCard(card: AgentCard, answer?: string) {
	tasker.agent.cards = tasker.agent.cards.filter((open) => open.id !== card.id);
	await fetch(`/agent/cards/${card.id}`, { method: 'POST' }).catch(() => {});
	if (!answer) return;

	const chat = tasker.assistant;
	chat.messages.push({ role: 'assistant', content: card.text });
	chat.open = true;
	await sendMessage(answer);
}
