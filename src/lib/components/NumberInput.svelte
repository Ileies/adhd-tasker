<script lang="ts">
	import { tick } from 'svelte';
	import { Minus, Plus } from '@lucide/svelte';
	import { stepNumber } from '#lib/taskform.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	/** A number field with a tap on each side, so no keyboard is needed. */
	let {
		value = $bindable(0),
		label,
		name,
		min,
		max,
		step,
		class: className = ''
	}: {
		value?: number;
		label: string;
		name?: string;
		min: number;
		max: number;
		step: number;
		class?: string;
	} = $props();

	let input: HTMLInputElement | null = $state(null);

	async function move(delta: number) {
		value = stepNumber(Number(value) || 0, delta, min, max);
		await tick();
		input?.dispatchEvent(new Event('change', { bubbles: true }));
	}
</script>

<div class="flex items-center gap-1">
	<Button
		type="button"
		variant="outline"
		size="icon"
		class="size-11 shrink-0 md:size-8"
		aria-label="{label}: less"
		onclick={() => move(-step)}
	>
		<Minus />
	</Button>
	<Input
		bind:ref={input}
		type="number"
		{name}
		{min}
		{max}
		{step}
		bind:value
		class="h-11 w-24 md:h-8 {className}"
		aria-label={label}
	/>
	<Button
		type="button"
		variant="outline"
		size="icon"
		class="size-11 shrink-0 md:size-8"
		aria-label="{label}: more"
		onclick={() => move(step)}
	>
		<Plus />
	</Button>
</div>
