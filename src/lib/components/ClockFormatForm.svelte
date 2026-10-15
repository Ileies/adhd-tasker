<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import PresetChips from '#lib/components/PresetChips.svelte';

	const { twelve }: { twelve: boolean } = $props();

	let message = $state<string | null>(null);

	async function put(hours: number) {
		message = await saveSettings({ ok: true, value: { clock12h: hours === 12 } });
	}
</script>

<div class="space-y-2">
	<p class="font-medium">Time format</p>
	<PresetChips
		label="Time format"
		options={[
			{ value: 24, label: '24 hour (15:00)' },
			{ value: 12, label: '12 hour (3:00 PM)' }
		]}
		value={twelve ? 12 : 24}
		onselect={put}
	/>
	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
</div>
