<script lang="ts" generics="T extends string">
	import type { Component } from 'svelte';

	/** Two or three connected buttons, one of them lit: a square-edged strip with no gap between the parts. */
	let {
		label,
		options,
		value,
		onselect,
		class: className = ''
	}: {
		label: string;
		options: {
			value: T;
			label: string;
			icon?: Component<{ class?: string }>;
			iconOnly?: boolean;
		}[];
		value: T;
		onselect: (value: T) => void;
		class?: string;
	} = $props();
</script>

<div
	class="h-11 shrink-0 overflow-hidden rounded-lg border md:h-10 {className}"
	role="radiogroup"
	aria-label={label}
>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={option.value === value}
			title={option.label}
			aria-label={option.label}
			class="inline-flex h-full cursor-pointer items-center gap-1.5 px-3 text-sm transition-colors not-first:border-l {option.value ===
			value
				? 'bg-primary text-primary-foreground'
				: 'bg-background hover:bg-muted'}"
			onclick={() => onselect(option.value)}
		>
			{#if option.icon}<option.icon class="size-4" />{/if}
			<span class={option.iconOnly ? 'hidden xl:inline' : ''}>{option.label}</span>
		</button>
	{/each}
</div>
