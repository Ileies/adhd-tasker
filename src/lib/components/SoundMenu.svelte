<script lang="ts">
	import { Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { MUTE_OPTIONS } from '#lib/mute.js';
	import { muteFor, setMuted, setVolume } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

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
	<Popover.Content align="end" class="w-72 space-y-4">
		<div class="space-y-1">
			{#if tasker.isMuted}
				<Button class="w-full justify-start" variant="secondary" onclick={() => setMuted(false)}>
					Unmute
				</Button>
			{:else}
				{#each MUTE_OPTIONS as option (option.text)}
					<Button
						class="w-full justify-start"
						variant="ghost"
						onclick={() => muteFor(option.minutes)}
					>
						{option.text}
					</Button>
				{/each}
			{/if}
		</div>

		<div class="space-y-2 px-1">
			<span class="text-sm font-medium" id="volume-label">Volume</span>
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
