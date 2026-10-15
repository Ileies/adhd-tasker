<script lang="ts">
	import { VolumeX } from '@lucide/svelte';
	import { effectiveClock12h } from '#lib/format.js';
	import { tasker } from '#lib/app.svelte.js';
	import { playsSound } from '#lib/alarms.js';
	import { silenceLine } from '#lib/silence.js';

	let { class: className = 'flex' }: { class?: string } = $props();

	// The icon is a second cue next to the words, the line never relies on color
	const line = $derived(
		silenceLine({
			muted: tasker.isMuted,
			volume: tasker.volume,
			blocked: tasker.device.audioBlocked,
			plays: playsSound(),
			mutedUntil:
				tasker.mutedUntil === null
					? null
					: new Intl.DateTimeFormat(undefined, {
							hour: effectiveClock12h(tasker.settings.clock12h) ? 'numeric' : '2-digit',
							minute: '2-digit',
							hourCycle: effectiveClock12h(tasker.settings.clock12h) ? 'h12' : 'h23',
							timeZone: tasker.timezone ?? undefined
						}).format(tasker.mutedUntil)
		})
	);
</script>

{#if line}
	<p class="items-center gap-2 text-base opacity-90 {className}" role="status">
		<VolumeX class="size-5 shrink-0" aria-hidden="true" />
		{line}
	</p>
{/if}
