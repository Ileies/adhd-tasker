<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { setTimezone } from '#lib/theme.js';
	import { deviceTimezone } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const device = deviceTimezone();
	const current = $derived(tasker.timezone ?? device);
	// Keep the saved value selectable even if this browser does not list it
	const zones = $derived(
		[...new Set([...Intl.supportedValuesOf('timeZone'), current])].sort((a, b) => a.localeCompare(b))
	);
</script>

<div class="space-y-3">
	<select
		class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
		value={current}
		onchange={(e) => setTimezone(e.currentTarget.value)}
		aria-label="Timezone"
	>
		{#each zones as zone (zone)}
			<option value={zone}>{zone.replaceAll('_', ' ')}</option>
		{/each}
	</select>

	{#if current !== device}
		<Button variant="outline" size="sm" onclick={() => setTimezone(device)}>
			Use this device's timezone ({device.replaceAll('_', ' ')})
		</Button>
	{/if}
</div>
