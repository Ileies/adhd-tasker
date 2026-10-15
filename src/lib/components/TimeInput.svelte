<script lang="ts">
	import { tick } from 'svelte';
	import { Minus, Plus } from '@lucide/svelte';
	import { formatClock, formatClock24 } from '#lib/format.js';
	import { parseClock, parseClockInput, stepClock } from '#lib/taskform.js';
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

	let hidden: HTMLInputElement | null = $state(null);

	// Shown in the user's 12 or 24 hour format, kept as `HH:MM` in `value` (a native time input would follow the browser locale instead)
	const minutes = $derived(parseClock(value));
	const shown = $derived(minutes === null ? '' : formatClock(minutes));

	async function commit(next: string) {
		value = next;
		await tick();
		// The same event a typed change makes, so forms that listen for change save too
		hidden?.dispatchEvent(new Event('change', { bubbles: true }));
		onchange?.(next);
	}

	function move(delta: number) {
		return commit(formatClock24(stepClock(minutes ?? 0, delta, step)));
	}

	function typed(event: Event & { currentTarget: HTMLInputElement }) {
		// The visible field has no name: only the hidden one reports, once the value is updated
		event.stopPropagation();
		const parsed = parseClockInput(event.currentTarget.value);
		if (parsed === null) {
			event.currentTarget.value = shown;
			return;
		}
		return commit(formatClock24(parsed));
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
	<input type="hidden" {name} {value} bind:this={hidden} />
	<Input
		type="text"
		inputmode="numeric"
		autocomplete="off"
		{required}
		value={shown}
		class="h-11 w-24 text-center md:h-8 {className}"
		aria-label={label}
		onchange={typed}
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
