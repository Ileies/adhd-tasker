<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { resolveCard } from '#lib/agent.js';
	import { Button } from '#lib/components/ui/button/index.js';

	// A small fixed region beside the hero: it never grows over the priority display and shows one card at a time
	const card = $derived(tasker.agent.cards[0]);
</script>

{#if card}
	<section class="bg-muted/40 rounded-lg border p-4" aria-label="Assistant" aria-live="polite">
		<h2 class="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
			Assistant
		</h2>
		<p class="line-clamp-4 break-words">{card.text}</p>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each card.options as option (option)}
				<Button size="sm" variant="secondary" onclick={() => resolveCard(card, option)}
					>{option}</Button
				>
			{/each}
			<Button
				size="sm"
				variant="ghost"
				class="text-muted-foreground"
				onclick={() => resolveCard(card)}>Dismiss</Button
			>
		</div>
	</section>
{/if}
