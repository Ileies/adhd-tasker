<script lang="ts">
	import type { Priority } from '#lib/types.js';
	import { priorityStyle } from '#lib/urgency.js';

	let { priority, showLabel = true }: { priority: Priority; showLabel?: boolean } = $props();

	const style = $derived(priorityStyle[priority] ?? priorityStyle[2]);
</script>

<!-- Filled segments carry the priority without relying on color -->
<span class="inline-flex items-center gap-2">
	<span class="flex gap-0.5" aria-hidden="true">
		{#each [1, 2, 3, 4, 5] as segment (segment)}
			<span class="h-3 w-1.5 rounded-sm bg-current {segment <= style.bars ? '' : 'opacity-25'}"
			></span>
		{/each}
	</span>
	{#if showLabel}
		<span>{style.label} priority</span>
	{:else}
		<span class="sr-only">{style.label} priority</span>
	{/if}
</span>
