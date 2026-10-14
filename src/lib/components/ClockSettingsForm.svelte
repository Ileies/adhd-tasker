<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { saveSettings } from '#lib/autosave.js';

	const { show }: { show: boolean } = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	async function save(event: Event) {
		saved = false;
		const checked = (event.target as HTMLInputElement).checked;
		message = await saveSettings({ ok: true, value: { showClock: checked } });
		if (message === null) {
			saved = true;
			await invalidateAll();
		}
	}
</script>

<div class="space-y-4">
	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			class="accent-primary mt-1 size-4 shrink-0"
			checked={show}
			onchange={save}
		/>
		<span>
			<span class="font-medium">Show the current time</span>
			<span class="text-muted-foreground block text-sm">
				The time of day with seconds in small, in the corner of the Now screen. Off by default.
			</span>
		</span>
	</label>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</div>
