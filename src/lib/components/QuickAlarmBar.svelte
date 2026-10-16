<script lang="ts">
	import { startTimer } from '#lib/alarms.js';
	import { QUICK_TIMERS, timerFields } from '#lib/alarmview.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let busy = $state(false);

	async function start(minutes: number) {
		busy = true;
		await startTimer(timerFields(minutes));
		busy = false;
	}
</script>

<div class="flex items-center gap-2" role="group" aria-label="Timers">
	{#each QUICK_TIMERS as timer (timer.minutes)}
		<Button
			variant="secondary"
			class="h-12 flex-1 text-base"
			disabled={busy}
			onclick={() => start(timer.minutes)}>{timer.label}</Button
		>
	{/each}
</div>
