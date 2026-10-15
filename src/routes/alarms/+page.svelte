<script lang="ts">
	import { onMount } from 'svelte';
	import { Play } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { addAlarm, cancelAlarm, loadSchedule } from '#lib/alarms.js';
	import { QUICK_TIMERS, groupAlarms, timerFields, toneLabel } from '#lib/alarmview.js';
	import { playTone } from '#lib';
	import { REPEATS, REPEAT_TEXT, SCHEDULE_LIMITS, type Repeat } from '#lib/schedule.js';
	import { TONE_NAMES, type ToneName } from '#lib/tones.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import OptionSelect from '#lib/components/OptionSelect.svelte';
	import PageFrame from '#lib/components/PageFrame.svelte';

	const DURATIONS = [1, 2, 5, 10, 15, SCHEDULE_LIMITS.maxAlarmMinutes];

	let at = $state('');
	let label = $state('');
	let tone = $state<ToneName>('wake');
	let repeat = $state<Repeat>('none');
	let duration = $state(String(SCHEDULE_LIMITS.defaultAlarmMinutes));
	let message = $state('');
	let busy = $state(false);

	onMount(() => void loadSchedule().catch(() => {}));

	const timezone = $derived(tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
	const groups = $derived(groupAlarms(tasker.schedule.alarms, Date.now(), timezone));

	const time = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
			timeZone: timezone
		})
	);
	const dayTime = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
			timeZone: timezone
		})
	);

	async function start(fields: Parameters<typeof addAlarm>[0]) {
		busy = true;
		message = (await addAlarm(fields)) ?? '';
		busy = false;
		return !message;
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const ok = await start({ at, label, tone, repeat, duration_minutes: Number(duration) });
		if (ok) {
			label = '';
			at = '';
		}
	}
</script>

<svelte:head>
	<title>Alarms - ADHD Tasker</title>
</svelte:head>

{#snippet list(title: string, alarms: typeof tasker.schedule.alarms, format: Intl.DateTimeFormat)}
	{#if alarms.length}
		<section aria-label={title} class="space-y-2">
			<h2 class="text-muted-foreground text-sm font-medium">{title}</h2>
			<ul class="flex flex-col gap-3">
				{#each alarms as alarm (alarm.id)}
					<li class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="break-words">{alarm.label}</div>
							<div class="text-muted-foreground text-sm">
								{format.format(alarm.fireAt)}{alarm.repeat === 'none'
									? ''
									: `, ${REPEAT_TEXT[alarm.repeat]}`}{alarm.createdBy === 'agent'
									? ', by the assistant'
									: ''}
							</div>
						</div>
						<Button variant="ghost" size="sm" onclick={() => cancelAlarm(alarm)}>Cancel</Button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

<PageFrame title="Alarms">
	<div class="space-y-6">
		<section aria-label="Timers" class="space-y-2">
			<h2 class="font-medium">Timer</h2>
			<div class="flex flex-wrap gap-2">
				{#each QUICK_TIMERS as timer (timer.minutes)}
					<Button
						variant="secondary"
						class="min-h-11 md:min-h-8"
						disabled={busy}
						onclick={() => start(timerFields(timer.minutes))}>{timer.label}</Button
					>
				{/each}
			</div>
		</section>

		<form class="space-y-3" onsubmit={add}>
			<h2 class="font-medium">Alarm</h2>
			<div class="flex flex-wrap items-center gap-2">
				<Input type="time" bind:value={at} required class="h-11 w-32 md:h-8" aria-label="Time" />
				<Input
					bind:value={label}
					required
					maxlength={SCHEDULE_LIMITS.maxLabel}
					placeholder="What is it for"
					class="h-11 min-w-40 flex-1 md:h-8"
					aria-label="Label"
				/>
				<Button type="submit" disabled={busy} class="min-h-11 md:min-h-8">Add</Button>
			</div>
			<details class="text-sm">
				<summary class="text-muted-foreground cursor-pointer py-2"
					>Options: {toneLabel(tone)}, {REPEAT_TEXT[repeat]}, rings {duration} min</summary
				>
				<div class="flex flex-wrap items-center gap-2 pt-2">
					<OptionSelect
						bind:value={tone}
						label="Tone"
						class="w-36"
						options={TONE_NAMES.map((name) => ({ value: name, label: toneLabel(name) }))}
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon"
						aria-label="Play the tone"
						title="Play the tone"
						onclick={() => playTone(tone)}><Play /></Button
					>
					<OptionSelect
						bind:value={repeat}
						label="Repeat"
						class="w-36"
						options={REPEATS.map((option) => ({ value: option, label: REPEAT_TEXT[option] }))}
					/>
					<OptionSelect
						bind:value={duration}
						label="Rings for"
						class="w-40"
						options={DURATIONS.map((minutes) => ({
							value: String(minutes),
							label: `Rings ${minutes} min`
						}))}
					/>
				</div>
			</details>
			{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
		</form>

		{#if tasker.schedule.alarms.length === 0}
			<p class="text-muted-foreground">No alarms.</p>
		{:else}
			{@render list('Today', groups.today, time)}
			{@render list('Later', groups.later, dayTime)}
		{/if}
	</div>
</PageFrame>
