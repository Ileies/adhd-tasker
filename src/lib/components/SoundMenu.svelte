<script lang="ts">
	import { Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { MUTE_OPTIONS } from '#lib/mute.js';
	import { muteFor, setMuted, setVolume } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	// Matches DropdownMenu.Item so the sound and main menus read as one family
	const ROW =
		'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none';

	const silent = $derived(tasker.isMuted || tasker.volume === 0);
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-lg" aria-label="Sound" title="Sound">
				{#if silent}
					<VolumeX class="size-5" />
				{:else if tasker.volume < 50}
					<Volume1 class="size-5" />
				{:else}
					<Volume2 class="size-5" />
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<!-- Same panel as the main menu: w-64, p-1, compact rows, overlay layer -->
	<Popover.Content align="end" class="z-(--z-overlay) w-64 gap-0 p-1">
		<div>
			{#if tasker.isMuted}
				<button type="button" class={ROW} onclick={() => setMuted(false)}>Unmute</button>
			{:else}
				{#each MUTE_OPTIONS as option (option.text)}
					<button type="button" class={ROW} onclick={() => muteFor(option.minutes)}>
						{option.text}
					</button>
				{/each}
			{/if}
		</div>

		<Separator class="-mx-1 my-1 w-auto" />

		<div class="space-y-2 px-1.5 py-1">
			<span class="text-sm" id="volume-label">Volume</span>
			<Slider
				type="single"
				min={0}
				max={100}
				step={5}
				value={tasker.isMuted ? 0 : tasker.volume}
				onValueChange={setVolume}
				aria-labelledby="volume-label"
			/>
		</div>
	</Popover.Content>
</Popover.Root>
