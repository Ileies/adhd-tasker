<script lang="ts">
	import { startTimer } from '#lib/alarms.js';
	import { QUICK_TIMERS, timerFields } from '#lib/alarmview.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let { hidden = false }: { hidden?: boolean } = $props();

	let busy = $state(false);

	async function start(minutes: number) {
		busy = true;
		await startTimer(timerFields(minutes));
		busy = false;
	}
</script>

<!-- Appears with the top bar and fades with it, so the display stays calm. On wide screens it sits over the rail on the right -->
<div
	data-bar
	class="bg-background/70 absolute inset-x-0 bottom-0 z-(--z-bar) flex w-full items-center gap-2 px-3 py-2 backdrop-blur-md transition-opacity duration-500 md:rounded-t-xl lg:left-auto lg:w-1/3 lg:min-w-80
		{hidden ? 'pointer-events-none opacity-0' : ''}"
	role="group"
	aria-label="Timers"
	aria-hidden={hidden}
>
	{#each QUICK_TIMERS as timer (timer.minutes)}
		<Button
			variant="secondary"
			class="h-12 flex-1 text-base"
			disabled={busy}
			tabindex={hidden ? -1 : 0}
			onclick={() => start(timer.minutes)}>{timer.label}</Button
		>
	{/each}
</div>
