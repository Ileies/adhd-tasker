<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { dismissAlarm, snoozeAlarm } from '#lib/alarms.js';
	import { SNOOZE_MINUTES } from '#lib/alarmview.js';
	import { showToast } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';

	async function snooze() {
		const failure = await snoozeAlarm();
		if (failure) showToast(failure);
	}
</script>

{#if tasker.schedule.ringing}
	<!-- Calm on purpose: a fixed bar with text and buttons, no flashing and no motion -->
	<div
		class="border-primary bg-popover text-popover-foreground fixed inset-x-4 top-16 z-(--z-alarm) mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-xl border-2 py-3 pr-3 pl-4 shadow-lg"
		role="alert"
	>
		<span class="min-w-0 flex-1">
			<span class="text-muted-foreground block text-sm font-semibold tracking-wide uppercase"
				>Alarm</span
			>
			<span class="block text-lg break-words">{tasker.schedule.ringing.label}</span>
		</span>
		{#if tasker.schedule.ringing.canSnooze}
			<Button variant="secondary" onclick={snooze}>Snooze {SNOOZE_MINUTES} min</Button>
		{/if}
		<Button onclick={dismissAlarm}>Dismiss</Button>
	</div>
{/if}
