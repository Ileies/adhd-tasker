<script lang="ts">
	import { clockParts } from '#lib/time.js';
	import { effectiveClock12h } from '#lib/format.js';
	import { tasker } from '#lib/app.svelte.js';

	const {
		timezone,
		seconds = false,
		class: className = 'text-lg opacity-80'
	}: {
		timezone: string | null;
		/** Show the running seconds after the time. */
		seconds?: boolean;
		class?: string;
	} = $props();

	let parts = $state(clockParts(null, new Date(), effectiveClock12h(tasker.settings.clock12h)));

	$effect(() => {
		const tick = () =>
			(parts = clockParts(timezone, new Date(), effectiveClock12h(tasker.settings.clock12h)));
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- Not a live region: it must not be announced every second -->
<div class="tabular {className}" aria-label="Current time" role="timer">
	<span>{parts.time}</span>{#if seconds}<span class="text-[0.5em]">:{parts.seconds}</span
		>{/if}{#if parts.period}<span class="text-[0.5em]"> {parts.period}</span>{/if}
</div>
