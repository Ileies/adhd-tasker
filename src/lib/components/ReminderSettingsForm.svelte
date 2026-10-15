<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import {
		CHECK_IN_PRESETS,
		HEADS_UP_PRESETS,
		OVERRUN_PRESETS,
		minutesChip,
		withCurrent,
		type SettingsPatch
	} from '#lib/settings.js';
	import PresetChips from '#lib/components/PresetChips.svelte';

	const {
		checkIn,
		reminders,
		advance,
		hyperfocus,
		overrun,
		showClock
	}: {
		checkIn: number;
		reminders: boolean;
		advance: number;
		hyperfocus: boolean;
		overrun: number;
		showClock: boolean;
	} = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	const chips = (presets: number[], current: number) =>
		withCurrent(presets, current).map((value) => ({ value, label: minutesChip(value) }));

	async function put(value: SettingsPatch) {
		saved = false;
		message = await saveSettings({ ok: true, value });
		saved = message === null;
	}
</script>

<div class="space-y-6">
	<div class="space-y-2">
		<p class="font-medium">Check-in chime</p>
		<p class="text-muted-foreground text-sm">A soft chime while a task is running.</p>
		<PresetChips
			label="Check-in chime interval"
			options={chips(CHECK_IN_PRESETS, checkIn).map((o) => ({
				...o,
				label: o.value === 0 ? 'Off' : `Every ${o.label}`
			}))}
			value={checkIn}
			onselect={(checkInMinutes) => put({ checkInMinutes })}
		/>
	</div>

	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={reminders}
				onchange={(e) => put({ enableReminders: e.currentTarget.checked })}
			/>
			<span>
				<span class="font-medium">Heads-up before the next task</span>
				<span class="text-muted-foreground block text-sm"
					>A soft chime and a note, so you can wrap up before it starts.</span
				>
			</span>
		</label>
		<div class="pl-7">
			<PresetChips
				label="Minutes before the task starts"
				options={chips(HEADS_UP_PRESETS, advance)}
				value={advance}
				disabled={!reminders}
				onselect={(reminderAdvanceTime) => put({ reminderAdvanceTime })}
			/>
		</div>
	</div>

	<div class="space-y-2">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={hyperfocus}
				onchange={(e) => put({ hyperfocusAlarm: e.currentTarget.checked })}
			/>
			<span>
				<span class="font-medium">Tap when a task runs over</span>
				<span class="text-muted-foreground block text-sm"
					>Two short taps when you are still on a task after its end. The assistant reacts after the
					same time.</span
				>
			</span>
		</label>
		<div class="pl-7">
			<PresetChips
				label="Minutes after the task ends"
				options={chips(OVERRUN_PRESETS, overrun)}
				value={overrun}
				disabled={!hyperfocus}
				onselect={(overrunMinutes) => put({ overrunMinutes })}
			/>
		</div>
	</div>

	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			class="accent-primary mt-1 size-4 shrink-0"
			checked={showClock}
			onchange={(e) => put({ showClock: e.currentTarget.checked })}
		/>
		<span>
			<span class="font-medium">Show the current time</span>
			<span class="text-muted-foreground block text-sm"
				>The time of day in the corner of the Now screen.</span
			>
		</span>
	</label>

	<p class="text-muted-foreground text-sm">
		Sounds play on the display device and follow mute. Volume, mute and which screen plays sound are
		in the sound menu in the top bar.
	</p>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</div>
