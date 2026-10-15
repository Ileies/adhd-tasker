<script lang="ts">
	import { editAlarm } from '#lib/alarms.js';
	import { durationChoices } from '#lib/alarmview.js';
	import { showToast } from '#lib';
	import { tasker, type Alarm } from '#lib/app.svelte.js';
	import { formatClock24 } from '#lib/format.js';
	import {
		SCHEDULE_LIMITS,
		WEEK_ORDER,
		dayName,
		repeatDays,
		repeatFromDays,
		repeatText,
		type Repeat
	} from '#lib/schedule.js';
	import { parseClock } from '#lib/taskform.js';
	import { localMoment } from '#lib/time.js';
	import { TONE_NAMES, TONE_TEXT, isToneName, type ToneName } from '#lib/tones.js';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let { alarm = $bindable() }: { alarm: Alarm | null } = $props();

	let label = $state('');
	let time = $state('');
	// The weekdays it rings on (0 Sunday to 6 Saturday), none picked means once
	let days = $state<number[]>([]);
	const repeat = $derived<Repeat>(repeatFromDays(days));
	const toggleDay = (day: number) =>
		(days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
	const presets: { text: string; days: number[] }[] = [
		{ text: 'Once', days: [] },
		{ text: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
		{ text: 'Mon to Fri', days: [1, 2, 3, 4, 5] }
	];
	let tone = $state<ToneName | null>(null);
	let durationMin = $state<number>(SCHEDULE_LIMITS.defaultAlarmMinutes);
	let failure = $state('');
	let saving = $state(false);

	// A custom tone (made by the agent) has no chip: it stays as it is until a named one is picked
	const customTone = $derived(alarm !== null && !isToneName(alarm.tone));

	$effect(() => {
		if (!alarm) return;
		const timezone = tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
		label = alarm.label;
		time = formatClock24(localMoment(alarm.fireAt, timezone).minutes);
		days = repeatDays(alarm.repeat) ?? [];
		tone = isToneName(alarm.tone) ? alarm.tone : null;
		durationMin = alarm.durationMin;
		failure = '';
		saving = false;
	});

	async function save(event: Event) {
		event.preventDefault();
		if (!alarm) return;
		if (!label.trim()) {
			failure = 'Give the alarm a name';
			return;
		}
		if (parseClock(time) === null) {
			failure = 'Pick a time';
			return;
		}
		saving = true;
		const message = await editAlarm(alarm, {
			at: time,
			label: label.trim(),
			repeat,
			duration_minutes: durationMin,
			...(tone ? { tone } : {})
		});
		saving = false;
		if (message) {
			failure = message;
			return;
		}
		showToast(`Saved: ${label.trim()}`);
		alarm = null;
	}

	const chip =
		'min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors md:min-h-8';
	const lit = 'bg-primary text-primary-foreground border-primary';
	const unlit = 'bg-background hover:bg-muted';
</script>

<Dialog.Root open={alarm !== null} onOpenChange={(open) => !open && (alarm = null)}>
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md"
	>
		<Dialog.Header>
			<Dialog.Title class="sr-only">Edit alarm</Dialog.Title>
			<Dialog.Description class="sr-only"
				>Name, time, repeat, sound and how long it rings</Dialog.Description
			>
		</Dialog.Header>

		<form onsubmit={save} class="space-y-5">
			<Input
				type="text"
				class="h-12 text-xl md:text-xl"
				bind:value={label}
				maxlength={SCHEDULE_LIMITS.maxLabel}
				aria-label="Name"
				required
			/>

			<TimeInput label="Time" bind:value={time} required />

			<div class="space-y-2">
				<div class="flex flex-wrap gap-2" role="group" aria-label="Repeat">
					{#each presets as preset (preset.text)}
						<button
							type="button"
							class="{chip} {repeatFromDays(preset.days) === repeat ? lit : unlit}"
							aria-pressed={repeatFromDays(preset.days) === repeat}
							onclick={() => (days = preset.days)}>{preset.text}</button
						>
					{/each}
				</div>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Days">
					{#each WEEK_ORDER as day (day)}
						<button
							type="button"
							class="{chip} {days.includes(day) ? lit : unlit}"
							aria-pressed={days.includes(day)}
							aria-label={dayName(day)}
							onclick={() => toggleDay(day)}>{dayName(day, true)}</button
						>
					{/each}
				</div>
				<p class="text-muted-foreground text-sm">{repeatText(repeat)}</p>
			</div>

			<div class="flex flex-wrap gap-2" role="group" aria-label="Sound">
				{#if customTone}
					<span class="{chip} {tone === null ? lit : unlit} inline-flex items-center"
						>Custom sound</span
					>
				{/if}
				{#each TONE_NAMES as name (name)}
					<button
						type="button"
						class="{chip} {tone === name ? lit : unlit}"
						aria-pressed={tone === name}
						onclick={() => (tone = name)}>{TONE_TEXT[name].split(':')[0]}</button
					>
				{/each}
			</div>

			<div class="space-y-2">
				<p class="text-muted-foreground text-sm">Rings for</p>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Rings for">
					{#each durationChoices(alarm?.durationMin ?? durationMin) as minutes (minutes)}
						<button
							type="button"
							class="{chip} {durationMin === minutes ? lit : unlit}"
							aria-pressed={durationMin === minutes}
							onclick={() => (durationMin = minutes)}>{minutes} min</button
						>
					{/each}
				</div>
			</div>

			{#if failure}
				<p class="text-destructive text-sm" role="alert">{failure}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<Button type="button" variant="ghost" onclick={() => (alarm = null)}>Cancel</Button>
				<Button type="submit" disabled={saving}>Save</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
