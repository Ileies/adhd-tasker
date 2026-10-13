<script lang="ts">
	import { Volume1, Volume2, VolumeX } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { setMuted, setVolume } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	const silent = $derived(tasker.isMuted || tasker.volume === 0);

	let open = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	function show() {
		clearTimeout(closeTimer);
		open = true;
	}

	// Short delay so the pointer can travel from the button to the popover
	function hide() {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => (open = false), 150);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-lg"
				onclick={() => setMuted(!tasker.isMuted)}
				onmouseenter={show}
				onmouseleave={hide}
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
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		class="flex w-52 items-center gap-3 p-3"
		onmouseenter={show}
		onmouseleave={hide}
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<Slider
			type="single"
			min={0}
			max={100}
			step={5}
			value={tasker.isMuted ? 0 : tasker.volume}
			onValueChange={setVolume}
			aria-label="Volume"
		/>
		<span class="w-9 shrink-0 text-right font-mono text-sm text-muted-foreground">
			{tasker.isMuted ? 'Off' : `${tasker.volume}%`}
		</span>
	</Popover.Content>
</Popover.Root>
