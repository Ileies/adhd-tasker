<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { dismissToast, errorText, showToast } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

{#if tasker.toasts.length > 0}
	<div
		class="pointer-events-none fixed inset-x-4 bottom-6 z-(--z-toast) mx-auto flex max-w-md flex-col gap-2"
	>
		{#each tasker.toasts as toast, i (toast.id)}
			<!-- With a full stack the oldest recedes, so it reads as "there is more behind" -->
			<div
				class="bg-popover text-popover-foreground pointer-events-auto flex items-center gap-3 rounded-xl border py-2 pr-2 pl-4 shadow-lg {i ===
					0 && tasker.toasts.length >= 4
					? 'mx-3 opacity-50'
					: ''}"
				role="status"
			>
				<span class="min-w-0 flex-1 truncate">{toast.message}</span>
				{#if toast.undo}
					<Button
						variant="secondary"
						onclick={() => {
							const undo = toast.undo;
							dismissToast(toast.id);
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
		{/each}
	</div>
{/if}
