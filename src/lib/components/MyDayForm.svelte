<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import { formatClock24 } from '#lib/format.js';
	import { parseClock } from '#lib/taskform.js';
	import TimeInput from '#lib/components/TimeInput.svelte';

	const { start, end, startWork }: { start: number; end: number; startWork: number } = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	async function save(event: Event) {
		saved = false;
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const myDayStart = parseClock(String(form.get('start') ?? ''));
		// A field cleared to nothing is not a time, and 24:00 is not offered by a time input
		const myDayEnd = parseClock(String(form.get('end') ?? ''));
		const startWorkAt = parseClock(String(form.get('work') ?? ''));
		message = await saveSettings(
			myDayStart === null || myDayEnd === null || startWorkAt === null
				? { ok: false, error: 'My day and the start of work need a time each' }
				: {
						ok: true,
						value: { myDayStart, myDayEnd: myDayEnd === 0 ? 1440 : myDayEnd, startWorkAt }
					}
		);
		saved = message === null;
	}
</script>

<form class="space-y-4" onchange={save} onsubmit={(event) => event.preventDefault()}>
	<div class="space-y-2">
		<p class="font-medium">My day</p>
		<div class="flex flex-wrap items-center gap-2">
			<TimeInput name="start" value={formatClock24(start)} label="My day starts" />
			<span>to</span>
			<TimeInput name="end" value={formatClock24(end % 1440)} label="My day ends" />
		</div>
	</div>
	<div class="space-y-2">
		<p class="font-medium">Start working at</p>
		<TimeInput name="work" value={formatClock24(startWork)} label="Start working at" />
		<p class="text-muted-foreground text-sm">
			Until you tap Start, the app calls you from here on.
		</p>
	</div>
	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</form>
