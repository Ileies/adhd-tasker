<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { dismissToast, errorText, showToast } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

{#if tasker.toast}
	{@const toast = tasker.toast}
	<div
		class="bg-popover text-popover-foreground fixed inset-x-4 bottom-6 z-(--z-toast) mx-auto flex max-w-md items-center gap-3 rounded-xl border py-2 pr-2 pl-4 shadow-lg"
		role="status"
	>
		<span class="min-w-0 flex-1 truncate">{toast.message}</span>
		{#if toast.undo}
			<Button
				variant="secondary"
				onclick={() => {
					const undo = toast.undo;
					dismissToast();
					// An undo that fails on the network says so instead of failing silently
					void Promise.resolve(undo?.()).catch((error) =>
						showToast(errorText(error, 'Could not undo that'))
					);
				}}
			>
				Undo
			</Button>
		{/if}
	</div>
{/if}
