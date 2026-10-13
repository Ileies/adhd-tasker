<script lang="ts">
	import { Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { setMuted, setVolume } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	const silent = $derived(tasker.isMuted || tasker.volume === 0);
</script>

<!-- The slider slides out on hover or focus (a tap on touch screens), the button itself mutes -->
<div class="group flex items-center">
	<div
		class="w-0 overflow-hidden opacity-0 transition-all duration-200 group-focus-within:w-32 group-focus-within:opacity-100 group-hover:w-32 group-hover:opacity-100"
	>
		<div class="px-3">
			<Slider
				type="single"
				min={0}
				max={100}
				step={5}
				value={tasker.isMuted ? 0 : tasker.volume}
				onValueChange={setVolume}
				aria-label="Volume"
			/>
		</div>
	</div>

	<Button
		variant="ghost"
		size="icon-lg"
		onclick={() => setMuted(!tasker.isMuted)}
		title={tasker.isMuted ? 'Unmute' : `Mute (${tasker.volume}%)`}
		aria-label={tasker.isMuted ? 'Unmute sounds' : 'Mute sounds'}
	>
		{#if silent}
			<VolumeX class="size-5" />
		{:else if tasker.volume < 50}
			<Volume1 class="size-5" />
		{:else}
			<Volume2 class="size-5" />
		{/if}
	</Button>
</div>
