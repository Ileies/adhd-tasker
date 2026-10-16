<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { clearSampleDay } from '#lib/welcome.js';
</script>

<!-- On every screen while the plan holds the sample day, so it can always be left in one tap -->
{#if tasker.sample.length > 0}
	<div
		class="bg-muted text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm"
		role="status"
	>
		<span>This is a sample day. Edit it freely, nothing here is yours yet.</span>
		<Button variant="link" class="text-foreground h-auto p-0 text-sm" onclick={clearSampleDay}>
			Remove it and start over
		</Button>
	</div>
{/if}
