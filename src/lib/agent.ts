import { tasker, type AgentCard } from '#lib/app.svelte.js';
import { loadDay, showToast } from '#lib';
import { sendMessage, undoChange } from '#lib/assistant.js';
import { playsSound } from '#lib/alarms.js';
import { speak } from '#lib/speech.js';

/** Cards already seen on this page, so a card is spoken once however often the feed is fetched. */
const announced = new Set<number>();

/** Fetches what the agent did on its own: refreshes the plan, offers Undo for its edits and fills the strip on Now. The stream calls it when there is news. */
export async function pollAgent() {
	const since = tasker.agent.cursor;
	const feed = await tasker.backend.agent.feed(since);
	if (!feed) return;

	tasker.agent.cursor = feed.cursor;
	tasker.agent.cards = feed.cards;

	// Only the display device speaks unprompted, and only what is new: the first poll after a load stays silent
	// (the guardrails already decided server side that this card may exist, quiet hours included)
	const fresh = feed.cards.filter((card) => !announced.has(card.id));
	feed.cards.forEach((card) => announced.add(card.id));
	if (since !== null && tasker.voice.replies && playsSound() && fresh.length)
		void speak(fresh.at(-1)!.text);

	if (feed.changes.length) {
		await Promise.all(
			[...new Set(feed.changes.flatMap((change) => change.dates))].map((date) =>
				loadDay(date).catch(() => {})
			)
		);
		const changes = feed.changes.map((change) => ({ ...change, undone: false }));
		showToast(
			changes.length === 1 ? changes[0].summary : `Assistant made ${changes.length} changes`,
			async () => {
				// Newest first, so later changes to the same task are reverted before earlier ones
				for (const change of [...changes].reverse()) await undoChange(change);
			}
		);
	}
}

/**
 * Resolves a card. An answer continues in the chat: the question becomes the assistant's last message,
 * the chosen option the user's reply, so the assistant has the context and can act on a yes.
 */
export async function resolveCard(card: AgentCard, answer?: string) {
	tasker.agent.cards = tasker.agent.cards.filter((open) => open.id !== card.id);
	await tasker.backend.agent.resolveCard(card.id).catch(() => {});
	if (!answer) return;

	const chat = tasker.assistant;
	chat.messages.push({ role: 'assistant', content: card.text });
	chat.open = true;
	await sendMessage(answer);
}

/** Tells the server the user is stuck on a task or a to-do. The on-screen hint does not wait for it, a failure costs only the assistant's answer. */
export async function reportStuck(about: { taskId: number } | { todoId: number }, reason: string) {
	await tasker.backend.agent.stuck(about, reason).catch(() => {});
}
