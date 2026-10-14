<script lang="ts">
	import { clockParts } from '#lib/time.js';

	const { timezone }: { timezone: string | null } = $props();

	let parts = $state(clockParts(null));

	$effect(() => {
		const tick = () => (parts = clockParts(timezone));
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- Not a live region: it must not be announced every second -->
<div class="tabular text-lg opacity-80" aria-label="Current time" role="timer">
	<span>{parts.time}</span><span class="text-sm">:{parts.seconds}</span>
</div>
