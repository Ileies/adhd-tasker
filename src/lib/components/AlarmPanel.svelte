<script lang="ts">
	import { onMount } from 'svelte';
	import { tasker, type Alarm } from '#lib/app.svelte.js';
	import { cancelAlarm, loadSchedule, switchAlarm } from '#lib/alarms.js';
	import { dayPanelAlarms, type AlarmDayState } from '#lib/alarmview.js';
	import { showToast } from '#lib';
	import { effectiveClock12h } from '#lib/format.js';
	import { REPEAT_TEXT } from '#lib/schedule.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	/** The alarms next to the plan of one day: what rings that day is strong, what rings on other days softer, what is off grey. */
	let { date }: { date: string } = $props();

	onMount(() => void loadSchedule().catch(() => {}));

	const timezone = $derived(tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
	const rows = $derived(dayPanelAlarms(tasker.schedule.alarms, date, timezone));
	const clock12 = $derived(effectiveClock12h(tasker.settings.clock12h));
	const time = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: clock12 ? 'numeric' : '2-digit',
			minute: '2-digit',
			hourCycle: clock12 ? 'h12' : 'h23',
			timeZone: timezone
		})
	);
	const day = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: timezone
		})
	);

	/** Colors carry the state, the words say it too. */
	const STYLE: Record<AlarmDayState, string> = {
		'on-day': 'border-l-primary bg-primary/15',
		'other-day': 'border-l-primary/35 bg-primary/5 text-foreground/75',
		off: 'border-l-muted-foreground/30 bg-muted text-muted-foreground'
	};

	function status(alarm: Alarm, state: AlarmDayState) {
		if (state === 'off') return 'Off';
		if (state === 'on-day') return 'Rings this day';
		return alarm.repeat === 'weekdays' ? 'Not on weekends' : `Next ${day.format(alarm.fireAt)}`;
	}

	async function toggle(alarm: Alarm, enabled: boolean) {
		const failure = await switchAlarm(alarm, enabled);
		if (failure) showToast(failure);
	}
</script>

<aside class="flex h-full flex-col" aria-label="Alarms">
	<div class="flex items-center justify-between gap-2 border-b px-4 py-3">
		<h2 class="font-medium">Alarms</h2>
		<Button variant="ghost" size="sm" href="/alarms">All options</Button>
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto p-3">
		{#if rows.length === 0}
			<p class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
				No alarms. Switch the bar to Alarm to add one.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each rows as { alarm, state } (alarm.id)}
					<li class="flex items-center gap-3 rounded-lg border border-l-4 px-3 py-2 {STYLE[state]}">
						<div class="w-16 shrink-0 text-lg font-semibold tabular-nums">
							{time.format(alarm.fireAt)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="truncate">{alarm.label}</div>
							<div class="text-muted-foreground text-xs">
								{status(alarm, state)}{alarm.repeat === 'none'
									? ''
									: `, ${REPEAT_TEXT[alarm.repeat].toLowerCase()}`}
							</div>
						</div>
						<Switch
							checked={alarm.enabled}
							onCheckedChange={(value) => toggle(alarm, value)}
							aria-label="{alarm.label} on or off"
						/>
						<Button
							variant="ghost"
							size="sm"
							class="px-2"
							aria-label="Cancel {alarm.label}"
							onclick={() => cancelAlarm(alarm)}>Cancel</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</aside>
