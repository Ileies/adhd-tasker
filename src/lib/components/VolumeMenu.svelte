<script lang="ts">
	import { Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { setMuted, setVolume } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	const silent = $derived(tasker.isMuted || tasker.volume === 0);
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-lg" aria-label="Volume">
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
	<Popover.Content align="end" class="w-64 space-y-2">
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
					<VolumeX class="size-4" />
				{:else}
					<Volume2 class="size-4" />
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
	</Popover.Content>
</Popover.Root>
