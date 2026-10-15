<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { setTimezone } from '#lib/theme.js';
	import { deviceTimezone } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const device = deviceTimezone();
	const current = $derived(tasker.timezone ?? device);
	// The long list only shows when asked for
	let changing = $state(false);
	// Keep the saved value selectable even if this browser does not list it
	const zones = $derived(
		[...new Set([...Intl.supportedValuesOf('timeZone'), current])].sort((a, b) =>
			a.localeCompare(b)
		)
	);
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-3">
		<p class="font-medium">{current.replaceAll('_', ' ')}</p>
		{#if !changing}
			<Button variant="outline" size="sm" onclick={() => (changing = true)}>Change</Button>
		{/if}
	</div>

	{#if changing}
		<select
			class="border-input bg-background h-11 w-full rounded-md border px-2 text-sm md:h-9"
			value={current}
			onchange={(e) => {
				void setTimezone(e.currentTarget.value);
				changing = false;
			}}
			aria-label="Timezone"
		>
			{#each zones as zone (zone)}
				<option value={zone}>{zone.replaceAll('_', ' ')}</option>
			{/each}
		</select>
	{/if}

	{#if current !== device}
		<Button variant="outline" size="sm" onclick={() => setTimezone(device)}>
			Use this device's timezone ({device.replaceAll('_', ' ')})
		</Button>
	{/if}
</div>
