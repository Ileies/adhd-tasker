<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { dismissToast } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

{#if tasker.toast}
	{@const toast = tasker.toast}
	<div
		class="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-popover-foreground shadow-lg"
		role="status"
	>
		<span class="min-w-0 flex-1 truncate">{toast.message}</span>
		{#if toast.undo}
			<Button
				variant="secondary"
				onclick={() => {
					toast.undo?.();
					dismissToast();
				}}
			>
				Undo
			</Button>
		{/if}
	</div>
{/if}
