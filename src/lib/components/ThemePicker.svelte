<script lang="ts">
	import { Moon, Sun, SunMoon } from '@lucide/svelte';
	import { tasker, type ThemeMode } from '#lib/app.svelte.js';
	import { setDayTime, setTheme } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
		{ mode: 'light', label: 'Always light', icon: Sun },
		{ mode: 'dark', label: 'Always dark', icon: Moon },
		{ mode: 'auto', label: 'By daytime', icon: SunMoon }
	];

	function toTimeString(minutes: number): string {
		const h = String(Math.floor(minutes / 60)).padStart(2, '0');
		const m = String(minutes % 60).padStart(2, '0');
		return `${h}:${m}`;
	}

	function onTimeChange(key: 'dayStart' | 'dayEnd', value: string) {
		const [h, m] = value.split(':').map(Number);
		if (Number.isNaN(h) || Number.isNaN(m)) return;
		setDayTime(key, h * 60 + m);
	}
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
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<span>Light from</span>
			<Input
				type="time"
				class="h-8 w-28 px-2 text-sm"
				value={toTimeString(tasker.dayStart)}
				onchange={(e) => onTimeChange('dayStart', e.currentTarget.value)}
				aria-label="Daytime starts"
			/>
			<span>to</span>
			<Input
				type="time"
				class="h-8 w-28 px-2 text-sm"
				value={toTimeString(tasker.dayEnd)}
				onchange={(e) => onTimeChange('dayEnd', e.currentTarget.value)}
				aria-label="Daytime ends"
			/>
		</div>
		<p class="text-xs text-muted-foreground">Dark outside these hours.</p>
	{/if}
</div>
