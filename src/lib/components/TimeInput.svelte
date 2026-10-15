<script lang="ts">
	import { tick } from 'svelte';
	import { Minus, Plus } from '@lucide/svelte';
	import { formatClock24 } from '#lib/format.js';
	import { parseClock, stepClock } from '#lib/taskform.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	/** A time field with a tap on each side: quarter hours up and down, so no keyboard is needed. */
	let {
		value = $bindable(''),
		label,
		name,
		step = 15,
		required = false,
		class: className = '',
		onchange
	}: {
		value?: string;
		label: string;
		name?: string;
		step?: number;
		required?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	} = $props();

	let input: HTMLInputElement | null = $state(null);

	async function move(delta: number) {
		value = formatClock24(stepClock(parseClock(value) ?? 0, delta, step));
		await tick();
		// The same event a typed change makes, so forms that listen for change save too
		input?.dispatchEvent(new Event('change', { bubbles: true }));
	}
</script>

<div class="flex items-center gap-1">
	<Button
		type="button"
		variant="outline"
		size="icon"
		class="size-11 shrink-0 md:size-8"
		aria-label="{label}: {step} minutes earlier"
		onclick={() => move(-1)}
	>
		<Minus />
	</Button>
	<Input
		bind:ref={input}
		type="time"
		{name}
		{required}
		bind:value
		class="h-11 w-auto md:h-8 {className}"
		aria-label={label}
		onchange={(e) => onchange?.(e.currentTarget.value)}
	/>
	<Button
		type="button"
		variant="outline"
		size="icon"
		class="size-11 shrink-0 md:size-8"
		aria-label="{label}: {step} minutes later"
		onclick={() => move(1)}
	>
		<Plus />
	</Button>
</div>
