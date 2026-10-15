<script lang="ts">
	import { onMount } from 'svelte';
	import { Play } from '@lucide/svelte';
	import { effectiveClock12h } from '#lib/format.js';
	import { tasker } from '#lib/app.svelte.js';
	import { addAlarm, cancelAlarm, loadSchedule } from '#lib/alarms.js';
	import { QUICK_TIMERS, groupAlarms, timerFields, toneLabel } from '#lib/alarmview.js';
	import { playTone } from '#lib';
	import { REPEATS, REPEAT_TEXT, SCHEDULE_LIMITS, type Repeat } from '#lib/schedule.js';
	import { TONE_NAMES, type ToneName } from '#lib/tones.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import MicButton from '#lib/components/MicButton.svelte';
	import { canTalk } from '#lib/speech.js';
	import OptionSelect from '#lib/components/OptionSelect.svelte';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { joinHeard } from '#lib/taskform.js';
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
			hour: effectiveClock12h(tasker.settings.clock12h) ? 'numeric' : '2-digit',
			minute: '2-digit',
			hourCycle: effectiveClock12h(tasker.settings.clock12h) ? 'h12' : 'h23',
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

{#snippet list(title: string, alarms: typeof tasker.schedule.alarms, showDay: boolean)}
	{#if alarms.length}
		<section aria-label={title} class="space-y-2">
			<h2 class="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				{title}
			</h2>
			<ul class="divide-y overflow-hidden rounded-xl border">
				{#each alarms as alarm (alarm.id)}
					{@const meta = [
						showDay ? day.format(alarm.fireAt) : '',
						alarm.repeat === 'none' ? '' : REPEAT_TEXT[alarm.repeat],
						alarm.createdBy === 'agent' ? 'by the assistant' : ''
					].filter(Boolean)}
					<li class="flex items-center gap-4 px-4 py-3">
						<div class="w-20 shrink-0 text-2xl font-semibold tabular-nums">
							{time.format(alarm.fireAt)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="break-words">{alarm.label}</div>
							{#if meta.length}
								<div class="text-muted-foreground text-sm">{meta.join(', ')}</div>
							{/if}
						</div>
						<Button
							variant="ghost"
							size="sm"
							class="min-h-11 md:min-h-8"
							onclick={() => cancelAlarm(alarm)}>Cancel</Button
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

<PageFrame title="Alarms">
	<div class="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
		<div class="space-y-6">
			<section aria-label="Timers" class="space-y-3 rounded-xl border p-4">
				<h2 class="font-medium">Timer</h2>
				<div class="grid grid-cols-4 gap-2">
					{#each QUICK_TIMERS as timer (timer.minutes)}
						<Button
							variant="secondary"
							class="h-14 text-base md:h-12"
							disabled={busy}
							onclick={() => start(timerFields(timer.minutes))}>{timer.label}</Button
						>
					{/each}
				</div>
			</section>

			<form class="space-y-3 rounded-xl border p-4" onsubmit={add}>
				<h2 class="font-medium">Alarm</h2>
				<div class="flex flex-wrap items-center gap-2">
					<TimeInput bind:value={at} required label="Time" />
					<div class="relative min-w-40 flex-1">
						<Input
							bind:value={label}
							required
							maxlength={SCHEDULE_LIMITS.maxLabel}
							placeholder="What is it for"
							class="h-11 md:h-8 {canTalk() ? 'pr-12' : ''}"
							aria-label="Label"
						/>
						<MicButton
							class="absolute top-1/2 right-0.5 size-10 -translate-y-1/2 md:size-7"
							onheard={(text) =>
								(label = joinHeard(label, text).slice(0, SCHEDULE_LIMITS.maxLabel))}
						/>
					</div>
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
				<Button type="submit" disabled={busy} class="min-h-11 w-full md:min-h-9">Add alarm</Button>
			</form>
		</div>

		<div class="space-y-6">
			{#if tasker.schedule.alarms.length === 0}
				<p class="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
					No alarms.
				</p>
			{:else}
				{@render list('Today', groups.today, false)}
				{@render list('Later', groups.later, true)}
			{/if}
		</div>
	</div>
</PageFrame>
