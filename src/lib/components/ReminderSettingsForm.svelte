<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import {
		BREAK_MINUTES_PRESETS,
		CHECK_IN_PRESETS,
		CHECK_MINUTES_PRESETS,
		HEADS_UP_PRESETS,
		OVERRUN_PRESETS,
		minutesChip,
		withCurrent,
		type SettingsPatch
	} from '#lib/settings.js';
	import PresetChips from '#lib/components/PresetChips.svelte';

	const {
		checkIn,
		ask,
		breakFor,
		reminders,
		advance,
		hyperfocus,
		overrun,
		showClock
	}: {
		checkIn: number;
		ask: number;
		breakFor: number;
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
	<div class="space-y-3">
		<p class="font-medium">Ask how it's going every</p>
		<PresetChips
			label="Minutes between the questions on a to-do"
			options={chips(CHECK_MINUTES_PRESETS, ask)}
			value={ask}
			onselect={(checkMinutes) => put({ checkMinutes })}
		/>
	</div>

	<div class="space-y-3">
		<p class="font-medium">Break length</p>
		<PresetChips
			label="Minutes a break lasts"
			options={chips(BREAK_MINUTES_PRESETS, breakFor)}
			value={breakFor}
			onselect={(breakMinutes) => put({ breakMinutes })}
		/>
	</div>

	<div class="space-y-3">
		<p class="font-medium">Check-in chime</p>
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

	<div class="space-y-3">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={reminders}
				onchange={(e) => put({ enableReminders: e.currentTarget.checked })}
			/>
			<span class="font-medium">Heads-up before the next task</span>
		</label>
		<PresetChips
			label="Minutes before the task starts"
			options={chips(HEADS_UP_PRESETS, advance)}
			value={advance}
			disabled={!reminders}
			onselect={(reminderAdvanceTime) => put({ reminderAdvanceTime })}
		/>
	</div>

	<div class="space-y-3">
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				class="accent-primary mt-1 size-4 shrink-0"
				checked={hyperfocus}
				onchange={(e) => put({ hyperfocusAlarm: e.currentTarget.checked })}
			/>
			<span class="font-medium">Tap when a task runs over</span>
		</label>
		<PresetChips
			label="Minutes after the task ends"
			options={chips(OVERRUN_PRESETS, overrun)}
			value={overrun}
			disabled={!hyperfocus}
			onselect={(overrunMinutes) => put({ overrunMinutes })}
		/>
	</div>

	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			class="accent-primary mt-1 size-4 shrink-0"
			checked={showClock}
			onchange={(e) => put({ showClock: e.currentTarget.checked })}
		/>
		<span class="font-medium">Show the current time on the Now screen</span>
	</label>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</div>
