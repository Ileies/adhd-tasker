<script lang="ts">
	import * as Select from '#lib/components/ui/select/index.js';

	let {
		value = $bindable(),
		options,
		label,
		class: className = 'w-44'
	}: {
		value: string;
		options: { value: string; label: string }[];
		label: string;
		class?: string;
	} = $props();

	const shown = $derived(options.find((option) => option.value === value)?.label ?? '');
</script>

<Select.Root type="single" bind:value>
	<Select.Trigger class="{className} min-h-11 md:min-h-8" aria-label={label}>{shown}</Select.Trigger
	>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>
