<script lang="ts">
	import { addAlarm } from '#lib/alarms.js';
	import { showToast } from '#lib';
	import { quickAlarmFields, quickAlarmPreview } from '#lib/quickalarm.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	let { hidden = false }: { hidden?: boolean } = $props();

	let text = $state('');
	let busy = $state(false);

	const preview = $derived(quickAlarmPreview(text));
	const fields = $derived(quickAlarmFields(text));
	/** Typed something that names no time: say what is missing instead of failing on Add. */
	const hint = $derived(preview ?? (text.trim() ? 'Add a time: 7:00, 8am or in 10 min' : ''));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!fields || busy) return;
		busy = true;
		const failure = await addAlarm(fields);
		busy = false;
		if (failure) return void showToast(failure);
		text = '';
		showToast(`Alarm set: ${preview?.replace(/^Rings /, '').toLowerCase()}`);
	}
</script>

<!-- Appears with the top bar and fades with it, so the display stays calm -->
<form
	data-bar
	class="bg-background/70 absolute inset-x-0 bottom-0 z-(--z-bar) mx-auto flex w-full max-w-xl flex-col gap-1 px-3 py-2 backdrop-blur-md transition-opacity duration-500 md:rounded-t-xl
		{hidden ? 'pointer-events-none opacity-0' : ''}"
	onsubmit={submit}
	aria-hidden={hidden}
>
	<div class="flex gap-2">
		<Input
			bind:value={text}
			class="h-11 min-w-0 flex-1 text-base md:h-10"
			placeholder="Set an alarm: Meds 8:00 daily, Tea in 5 min"
			aria-label="Quick add an alarm"
			tabindex={hidden ? -1 : 0}
		/>
		<Button type="submit" class="h-11 px-5 md:h-10" disabled={!fields || busy}>Set</Button>
	</div>
	{#if hint}
		<p class="text-muted-foreground h-5 truncate text-sm" role="status" aria-live="polite">
			{hint}
		</p>
	{/if}
</form>
