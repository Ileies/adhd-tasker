<script lang="ts">
	import { flushSync, onMount } from 'svelte';
	import { Moon, Sun, SunMoon, Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker, type ThemeMode } from '#lib/app.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';


	const themeOptions: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
		{ mode: 'light', label: 'Light', icon: Sun },
		{ mode: 'dark', label: 'Dark', icon: Moon },
		{ mode: 'auto', label: 'Daytime', icon: SunMoon }
	];

	let isDark = $state(false);

	const silent = $derived(tasker.isMuted || tasker.volume === 0);

	function resolveDark(mode: ThemeMode): boolean {
		if (mode === 'auto') {
			const now = new Date();
			const minutes = now.getHours() * 60 + now.getMinutes();
			const { dayStart, dayEnd } = tasker;
			const isDay = dayStart <= dayEnd ? minutes >= dayStart && minutes < dayEnd : minutes >= dayStart || minutes < dayEnd;
			return !isDay;
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

	function toTimeString(minutes: number): string {
		const h = String(Math.floor(minutes / 60)).padStart(2, '0');
		const m = String(minutes % 60).padStart(2, '0');
		return `${h}:${m}`;
	}

	function setDayTime(key: 'dayStart' | 'dayEnd', value: string) {
		const [h, m] = value.split(':').map(Number);
		if (Number.isNaN(h) || Number.isNaN(m)) return;
		tasker[key] = h * 60 + m;
		save(key, String(tasker[key]));
		transitionTo(resolveDark(tasker.themeMode));
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
			for (const key of ['dayStart', 'dayEnd'] as const) {
				const raw = localStorage.getItem(key);
				const minutes = Number(raw);
				if (raw !== null && minutes >= 0 && minutes < 1440) tasker[key] = minutes;
			}
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
			<Button {...props} variant="ghost" size="lg" class="gap-1.5 px-2" aria-label="Sound and theme">
				{#if silent}
					<VolumeX class="size-5" />
				{:else if tasker.volume < 50}
					<Volume1 class="size-5" />
				{:else}
					<Volume2 class="size-5" />
				{/if}
				{#if isDark}
					<Moon class="size-5" />
				{:else}
					<Sun class="size-5" />
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-72 space-y-4">
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
				<div class="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
					<span>Light</span>
					<Input
						type="time"
						class="h-8 px-2 text-xs"
						value={toTimeString(tasker.dayStart)}
						onchange={(e) => setDayTime('dayStart', e.currentTarget.value)}
						aria-label="Daytime starts"
					/>
					<span>to</span>
					<Input
						type="time"
						class="h-8 px-2 text-xs"
						value={toTimeString(tasker.dayEnd)}
						onchange={(e) => setDayTime('dayEnd', e.currentTarget.value)}
						aria-label="Daytime ends"
					/>
				</div>
				<p class="text-xs text-muted-foreground">Dark outside these hours.</p>
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
