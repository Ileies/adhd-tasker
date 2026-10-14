<script lang="ts">
	import { enhance } from '$app/forms';
	import { OVERRUN_LIMITS, REMINDER_LIMITS } from '#lib/anchoring.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const {
		reminders,
		advance,
		hyperfocus,
		overrun,
		message,
		saved
	}: { reminders: boolean; advance: number; hyperfocus: boolean; overrun: number; message?: string; saved?: boolean } = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/saveAnchoring"
	class="space-y-5"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input type="checkbox" name="reminders" class="mt-1 size-4 shrink-0 accent-primary" checked={reminders} />
			<span>
				<span class="font-medium">Heads-up before the next task</span>
				<span class="block text-sm text-muted-foreground">A soft chime and a note, so you can wrap up before it starts.</span>
			</span>
		</label>
		<div class="flex items-center gap-2 pl-7">
			<Input type="number" name="advance" min={REMINDER_LIMITS.min} max={REMINDER_LIMITS.max} step="1" value={advance} class="w-24" aria-label="Minutes before the task starts" />
			<span>minutes before</span>
		</div>
	</div>

	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input type="checkbox" name="hyperfocus" class="mt-1 size-4 shrink-0 accent-primary" checked={hyperfocus} />
			<span>
				<span class="font-medium">Tap when a task runs over</span>
				<span class="block text-sm text-muted-foreground">Two short taps when you are still on a task that should have ended, in case you are deep in it.</span>
			</span>
		</label>
		<div class="flex items-center gap-2 pl-7">
			<Input type="number" name="overrun" min={OVERRUN_LIMITS.min} max={OVERRUN_LIMITS.max} step="1" value={overrun} class="w-24" aria-label="Minutes after the task ends" />
			<span>minutes after it ends</span>
		</div>
		<p class="pl-7 text-sm text-muted-foreground">The assistant uses the same time when it reacts to an overrun. Both sounds play on the display device and respect mute.</p>
	</div>

	{#if message}<p class="text-sm text-destructive" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-sm text-success" role="status">Saved.</p>{/if}

	<Button type="submit" disabled={busy}>Save</Button>
</form>
