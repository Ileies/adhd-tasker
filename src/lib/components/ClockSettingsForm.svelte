<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';

	const { show, saved }: { show: boolean; saved?: boolean } = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/saveClock"
	class="space-y-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<label class="flex cursor-pointer items-start gap-3">
		<input type="checkbox" name="show" class="accent-primary mt-1 size-4 shrink-0" checked={show} />
		<span>
			<span class="font-medium">Show the current time</span>
			<span class="text-muted-foreground block text-sm">
				The time of day with seconds in small, in the corner of the Now screen. Off by default.
			</span>
		</span>
	</label>

	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}

	<Button type="submit" disabled={busy}>Save</Button>
</form>
