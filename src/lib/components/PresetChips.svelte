<script lang="ts" generics="T extends number | null">
	/** One tap instead of a number field: the choices as chips, the lit one is the saved value. */
	const {
		label,
		options,
		value,
		onselect,
		disabled = false
	}: {
		label: string;
		options: { value: T; label: string }[];
		value: T;
		onselect: (value: T) => void;
		disabled?: boolean;
	} = $props();
</script>

<div class="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={option.value === value}
			{disabled}
			class="min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors disabled:cursor-default disabled:opacity-50 md:min-h-8 {option.value ===
			value
				? 'bg-primary text-primary-foreground border-primary'
				: 'bg-background hover:bg-muted'}"
			onclick={() => onselect(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>
