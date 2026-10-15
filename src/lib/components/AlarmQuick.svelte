<script lang="ts">
	import { addAlarm } from '#lib/alarms.js';
	import { QUICK_TIMERS, timerFields } from '#lib/alarmview.js';
	import { SCHEDULE_LIMITS } from '#lib/schedule.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	let at = $state('');
	let label = $state('');
	let message = $state('');
	let busy = $state(false);

	async function start(fields: Parameters<typeof addAlarm>[0]) {
		busy = true;
		message = (await addAlarm(fields)) ?? '';
		busy = false;
		return !message;
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (await start({ at, label, tone: 'wake', repeat: 'none' })) {
			at = '';
			label = '';
		}
	}
</script>

<div class="flex items-center gap-2" role="group" aria-label="Timers and alarms">
	{#each QUICK_TIMERS as timer (timer.minutes)}
		<Button
			variant="secondary"
			size="sm"
			disabled={busy}
			onclick={() => start(timerFields(timer.minutes))}>{timer.label}</Button
		>
	{/each}
	<form class="ml-2 flex min-w-0 flex-1 items-center gap-2" onsubmit={add}>
		<Input type="time" bind:value={at} required class="h-8 w-28" aria-label="Alarm time" />
		<Input
			bind:value={label}
			required
			maxlength={SCHEDULE_LIMITS.maxLabel}
			placeholder="Alarm for"
			class="h-8 min-w-0 flex-1"
			aria-label="Alarm label"
		/>
		<Button type="submit" size="sm" variant="outline" disabled={busy}>Set alarm</Button>
	</form>
</div>
{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
