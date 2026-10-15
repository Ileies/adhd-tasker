<script lang="ts">
	import { Moon, Sun, SunMoon } from '@lucide/svelte';
	import { tasker, type ThemeMode } from '#lib/app.svelte.js';
	import { daylight, daylightLine } from '#lib/location.js';
	import { setTheme } from '#lib/theme.js';
	import { todayIn } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import LocationPicker from '#lib/components/LocationPicker.svelte';

	const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
		{ mode: 'light', label: 'Always light', icon: Sun },
		{ mode: 'dark', label: 'Always dark', icon: Moon },
		{ mode: 'auto', label: 'By daylight', icon: SunMoon }
	];

	const line = $derived(
		daylightLine(daylight(tasker.settings, tasker.timezone, todayIn(tasker.timezone)))
	);
</script>

<div class="space-y-3">
	<div class="grid grid-cols-3 gap-2">
		{#each options as option (option.mode)}
			<Button
				variant={tasker.themeMode === option.mode ? 'secondary' : 'outline'}
				class="flex h-auto flex-col gap-1.5 py-3"
				onclick={() => setTheme(option.mode)}
				aria-pressed={tasker.themeMode === option.mode}
			>
				<option.icon class="size-5" />
				<span class="text-xs">{option.label}</span>
			</Button>
		{/each}
	</div>

	{#if tasker.themeMode === 'auto'}
		<p class="text-muted-foreground text-sm">{line} Dark outside these hours.</p>
		<LocationPicker />
	{/if}
</div>
