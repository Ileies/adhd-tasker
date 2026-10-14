<script lang="ts">
	import { onMount } from 'svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { addAlarm, chooseDisplay, loadSchedule, removeEntry } from '#lib/alarms.js';
	import { playTone } from '#lib';
	import { REPEATS, REPEAT_TEXT, SCHEDULE_LIMITS, type Repeat } from '#lib/schedule.js';
	import { TONE_NAMES, TONE_TEXT, type ToneName } from '#lib/tones.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import PageFrame from '#lib/components/PageFrame.svelte';

	const sections = $derived([
		{ id: 'alarms', label: 'Alarms' },
		{ id: 'sound', label: 'Sound' },
		...(tasker.schedule.wakeups.length ? [{ id: 'wakeups', label: 'Assistant wakeups' }] : [])
	]);

	const select =
		'h-8 rounded-lg border border-input bg-transparent px-2 text-base md:text-sm dark:bg-input/30';

	let at = $state('');
	let label = $state('');
	const DURATIONS = [1, 2, 5, 10, 15, SCHEDULE_LIMITS.maxAlarmMinutes];

	let tone = $state<ToneName>('wake');
	let repeat = $state<Repeat>('none');
	let duration = $state<number>(SCHEDULE_LIMITS.defaultAlarmMinutes);
	let message = $state('');
	let busy = $state(false);

	onMount(() => void loadSchedule().catch(() => {}));

	const clock = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
			timeZone: tasker.timezone ?? undefined
		})
	);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = (await addAlarm({ at, label, tone, repeat, duration_minutes: duration })) ?? '';
		if (!message) {
			label = '';
			at = '';
		}
		busy = false;
	}

	const guest = $derived(tasker.account.email === null);
	const isDisplay = $derived(tasker.device.display === tasker.device.id);
</script>

<svelte:head>
	<title>Alarms - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Alarms" {sections}>
	<Card.Root id="alarms" class="scroll-mt-6">
		<Card.Header>
			<Card.Title>Alarms</Card.Title>
			<Card.Description
				>They ring on the Now screen while the app is open. The assistant can set alarms too, you
				can cancel any of them here.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-5">
			{#if tasker.schedule.alarms.length === 0}
				<p class="text-muted-foreground">No alarms.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each tasker.schedule.alarms as alarm (alarm.id)}
						<li class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="break-words">{alarm.label}</div>
								<div class="text-muted-foreground text-sm">
									{clock.format(alarm.fireAt)}{alarm.repeat === 'none'
										? ''
										: `, ${REPEAT_TEXT[alarm.repeat]}`}, set by {alarm.createdBy === 'agent'
										? 'the assistant'
										: 'you'}
								</div>
							</div>
							<Button variant="ghost" size="sm" onclick={() => removeEntry(alarm.id)}>Cancel</Button
							>
						</li>
					{/each}
				</ul>
			{/if}

			<form class="space-y-3" onsubmit={add}>
				<div class="flex flex-wrap items-center gap-2">
					<Input type="time" bind:value={at} required class="w-32" aria-label="Time" />
					<Input
						bind:value={label}
						required
						maxlength={60}
						placeholder="What is it for"
						class="min-w-40 flex-1"
						aria-label="Label"
					/>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<select bind:value={tone} class={select} aria-label="Tone">
						{#each TONE_NAMES as name (name)}<option value={name}>{TONE_TEXT[name]}</option>{/each}
					</select>
					<Button type="button" variant="secondary" size="sm" onclick={() => playTone(tone)}
						>Preview</Button
					>
					<select bind:value={repeat} class={select} aria-label="Repeat">
						{#each REPEATS as option (option)}<option value={option}>{REPEAT_TEXT[option]}</option
							>{/each}
					</select>
					<select bind:value={duration} class={select} aria-label="Rings for">
						{#each DURATIONS as minutes (minutes)}<option value={minutes}
								>Rings for {minutes} min</option
							>{/each}
					</select>
				</div>
				{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
				<Button type="submit" disabled={busy}>Add alarm</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root id="sound" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Sound</Card.Title>
			<Card.Description
				>{guest
					? 'With several tabs open, only one makes sound. The others show the alarm silently.'
					: 'With several screens open, only one should make sound. The others show the alarm silently.'}</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-3">
			<p class="text-sm">
				{#if guest}
					{isDisplay ? 'This tab plays them.' : 'Another tab of this browser plays them.'}
				{:else if tasker.device.display === null}
					Every open screen plays alarms and assistant tones.
				{:else if isDisplay}
					This device plays them.
				{:else}
					Another device plays them.
				{/if}
			</p>
			<!-- A guest's tabs elect the one that plays by themselves, only an account chooses a device -->
			{#if guest}{:else if isDisplay}
				<Button variant="secondary" onclick={() => chooseDisplay(null)}
					>Let every device play</Button
				>
			{:else}
				<Button variant="secondary" onclick={() => chooseDisplay(tasker.device.id)}
					>Use this device for sound</Button
				>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if tasker.schedule.wakeups.length}
		<Card.Root id="wakeups" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Assistant wakeups</Card.Title>
				<Card.Description
					>Times the assistant chose to look at your plan again. Nothing rings, it only reacts
					within its usual limits.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col gap-3">
					{#each tasker.schedule.wakeups as wakeup (wakeup.id)}
						<li class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="break-words">{wakeup.note}</div>
								<div class="text-muted-foreground text-sm">{clock.format(wakeup.fireAt)}</div>
							</div>
							<Button variant="ghost" size="sm" onclick={() => removeEntry(wakeup.id)}
								>Cancel</Button
							>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</PageFrame>
