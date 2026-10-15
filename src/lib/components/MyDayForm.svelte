<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import { formatClock } from '#lib/format.js';
	import { parseClock } from '#lib/taskform.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const { start, end }: { start: number; end: number } = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	async function save(event: Event) {
		saved = false;
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const myDayStart = parseClock(String(form.get('start') ?? ''));
		// A field cleared to nothing is not a time, and 24:00 is not offered by a time input
		const myDayEnd = parseClock(String(form.get('end') ?? ''));
		message = await saveSettings(
			myDayStart === null || myDayEnd === null
				? { ok: false, error: 'My day needs a start and an end time' }
				: { ok: true, value: { myDayStart, myDayEnd: myDayEnd === 0 ? 1440 : myDayEnd } }
		);
		saved = message === null;
	}
</script>

<form class="space-y-2" onchange={save} onsubmit={(event) => event.preventDefault()}>
	<p class="font-medium">My day</p>
	<div class="flex items-center gap-2">
		<Input
			type="time"
			name="start"
			value={formatClock(start)}
			class="h-11 w-32 md:h-8"
			aria-label="My day starts"
		/>
		<span>to</span>
		<Input
			type="time"
			name="end"
			value={formatClock(end % 1440)}
			class="h-11 w-32 md:h-8"
			aria-label="My day ends"
		/>
	</div>
	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</form>
