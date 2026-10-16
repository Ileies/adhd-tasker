<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { clearSampleDay } from '#lib/welcome.js';
</script>

<!-- At the bottom of every screen while the plan holds the sample day: the top bar hides and floats over the page, so it must not sit there -->
{#if tasker.sample.length > 0}
	<div
		class="bg-muted text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-sm"
		role="status"
	>
		<span>This is a sample day. Edit it freely, nothing here is yours yet.</span>
		<Button variant="link" class="text-foreground h-auto p-0 text-sm" onclick={clearSampleDay}>
			Remove it and start over
		</Button>
	</div>
{/if}
