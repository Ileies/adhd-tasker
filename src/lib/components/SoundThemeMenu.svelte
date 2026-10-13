<script lang="ts">
	import { flushSync, onMount } from 'svelte';
	import { Moon, Sun, SunMoon, Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker, type ThemeMode } from '#lib/app.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	// Auto mode: light from 07:00 to 18:59 local time, dark otherwise
	const DAY_START_HOUR = 7;
	const DAY_END_HOUR = 19;

	const themeOptions: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
		{ mode: 'light', label: 'Light', icon: Sun },
		{ mode: 'dark', label: 'Dark', icon: Moon },
		{ mode: 'auto', label: 'Daytime', icon: SunMoon }
	];

	let isDark = $state(false);

	const silent = $derived(tasker.isMuted || tasker.volume === 0);

	function resolveDark(mode: ThemeMode): boolean {
		if (mode === 'auto') {
			const hour = new Date().getHours();
			return hour < DAY_START_HOUR || hour >= DAY_END_HOUR;
		}
		return mode === 'dark';
	}

	function applyDark(dark: boolean) {
		isDark = dark;
		document.documentElement.classList.toggle('dark', dark);
	}

	function transitionTo(dark: boolean) {
		if (dark === isDark) return;
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!document.startViewTransition || reduceMotion) {
			applyDark(dark);
			return;
		}

		// Cross-fade the whole page between the two color schemes
		document.startViewTransition(() => {
			flushSync(() => applyDark(dark));
		});
	}

	function save(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {}
	}

	function setTheme(mode: ThemeMode) {
		tasker.themeMode = mode;
		save('theme', mode);
		transitionTo(resolveDark(mode));
	}

	function setVolume(value: number) {
		tasker.volume = value;
		save('volume', String(value));
		// Dragging the slider up implies the user wants to hear things again
		if (value > 0 && tasker.isMuted) setMuted(false);
	}

	function setMuted(muted: boolean) {
		tasker.isMuted = muted;
		save('muted', String(muted));
	}

	onMount(() => {
		try {
			const theme = localStorage.getItem('theme');
			if (theme === 'light' || theme === 'dark' || theme === 'auto') tasker.themeMode = theme;
			const volume = Number(localStorage.getItem('volume'));
			if (localStorage.getItem('volume') !== null && volume >= 0 && volume <= 100) tasker.volume = volume;
			tasker.isMuted = localStorage.getItem('muted') === 'true';
		} catch {}

		// The inline script in app.html only guesses, so sync to the loaded settings
		applyDark(resolveDark(tasker.themeMode));

		// Keep auto mode in sync as the day goes by
		const interval = setInterval(() => {
			if (tasker.themeMode === 'auto') transitionTo(resolveDark('auto'));
		}, 60_000);
		return () => clearInterval(interval);
	});
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-lg" aria-label="Sound and theme">
				<span class="relative grid h-5 w-5 place-items-center">
					{#if silent}
						<VolumeX class="h-5 w-5" />
					{:else if tasker.volume < 50}
						<Volume1 class="h-5 w-5" />
					{:else}
						<Volume2 class="h-5 w-5" />
					{/if}
				</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-64 space-y-4">
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium">Volume</span>
				<span class="font-mono text-sm text-muted-foreground">{tasker.isMuted ? 'Muted' : `${tasker.volume}%`}</span>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={() => setMuted(!tasker.isMuted)}
					aria-label={tasker.isMuted ? 'Unmute sounds' : 'Mute sounds'}
				>
					{#if silent}
						<VolumeX class="h-4 w-4" />
					{:else}
						<Volume2 class="h-4 w-4" />
					{/if}
				</Button>
				<Slider
					type="single"
					min={0}
					max={100}
					step={5}
					value={tasker.volume}
					onValueChange={setVolume}
					disabled={tasker.isMuted}
					aria-label="Volume"
				/>
			</div>
		</div>

		<div class="space-y-2">
			<span class="text-sm font-medium">Theme</span>
			<div class="grid grid-cols-3 gap-1">
				{#each themeOptions as option (option.mode)}
					<Button
						variant={tasker.themeMode === option.mode ? 'secondary' : 'ghost'}
						size="sm"
						class="flex h-auto flex-col gap-1 py-2"
						onclick={() => setTheme(option.mode)}
						aria-pressed={tasker.themeMode === option.mode}
					>
						<option.icon class="h-4 w-4" />
						<span class="text-xs">{option.label}</span>
					</Button>
				{/each}
			</div>
			{#if tasker.themeMode === 'auto'}
				<p class="text-xs text-muted-foreground">Light from {DAY_START_HOUR}:00 to {DAY_END_HOUR}:00, dark otherwise.</p>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>

<style>
	:global(::view-transition-old(root)),
	:global(::view-transition-new(root)) {
		animation-duration: 450ms;
		animation-timing-function: ease-in-out;
	}
</style>
