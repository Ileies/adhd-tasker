<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { OVERRUN_LIMITS, REMINDER_LIMITS, parseAnchoringForm } from '#lib/anchoring.js';
	import { saveSettings } from '#lib/autosave.js';
	import { anchoringPatch } from '#lib/settings.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const {
		reminders,
		advance,
		hyperfocus,
		overrun
	}: {
		reminders: boolean;
		advance: number;
		hyperfocus: boolean;
		overrun: number;
	} = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	async function save(event: Event) {
		saved = false;
		const parsed = parseAnchoringForm(new FormData(event.currentTarget as HTMLFormElement));
		message = await saveSettings(
			parsed.ok ? { ok: true, value: anchoringPatch(parsed.value) } : parsed
		);
		if (message === null) {
			saved = true;
			await invalidateAll();
		}
	}
</script>

<form class="space-y-5" onchange={save} onsubmit={(event) => event.preventDefault()}>
	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				name="reminders"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={reminders}
			/>
			<span>
				<span class="font-medium">Heads-up before the next task</span>
				<span class="text-muted-foreground block text-sm"
					>A soft chime and a note, so you can wrap up before it starts.</span
				>
			</span>
		</label>
		<div class="flex items-center gap-2 pl-7">
			<Input
				type="number"
				name="advance"
				min={REMINDER_LIMITS.min}
				max={REMINDER_LIMITS.max}
				step="1"
				value={advance}
				class="w-24"
				aria-label="Minutes before the task starts"
			/>
			<span>minutes before</span>
		</div>
	</div>

	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				name="hyperfocus"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={hyperfocus}
			/>
			<span>
				<span class="font-medium">Tap when a task runs over</span>
				<span class="text-muted-foreground block text-sm"
					>Two short taps when you are still on a task that should have ended, in case you are deep
					in it.</span
				>
			</span>
		</label>
		<div class="flex items-center gap-2 pl-7">
			<Input
				type="number"
				name="overrun"
				min={OVERRUN_LIMITS.min}
				max={OVERRUN_LIMITS.max}
				step="1"
				value={overrun}
				class="w-24"
				aria-label="Minutes after the task ends"
			/>
			<span>minutes after it ends</span>
		</div>
		<p class="text-muted-foreground pl-7 text-sm">
			The assistant uses the same time when it reacts to an overrun. Both sounds play on the display
			device and respect mute.
		</p>
	</div>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</form>
