<script lang="ts">
	import {
		AUTONOMY,
		REACTION_EVENTS,
		parseEvents,
		parseSettingsForm,
		type Autonomy
	} from '#lib/guardrails.js';
	import { saveSettings } from '#lib/autosave.js';
	import { BUDGET_PRESETS, agentPatch, budgetChip } from '#lib/settings.js';
	import { formatClock24 } from '#lib/format.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import PresetChips from '#lib/components/PresetChips.svelte';

	const {
		autonomy,
		events,
		quietStart,
		quietEnd,
		budget
	}: {
		autonomy: Autonomy;
		events: string;
		quietStart: number;
		quietEnd: number;
		budget: number | null;
	} = $props();

	const AUTONOMY_TEXT: Record<Autonomy, { label: string; detail: string }> = {
		observe: { label: 'Observe', detail: 'It only logs what happens and never reacts by itself.' },
		suggest: {
			label: 'Suggest',
			detail: 'It may show a note or a question on Now, but never changes your plan by itself.'
		},
		act: {
			label: 'Act',
			detail: 'It may also change your plan when it is clearly useful. Every change has an Undo.'
		}
	};

	const EVENT_TEXT: Record<string, string> = {
		'task.completed': 'A task is marked done or reopened',
		'task.missed': 'A task was not finished in time',
		'task.overrun': 'You are still on a task long after its end',
		'appointment.added': 'An appointment arrives and nobody is preparing for it',
		'focus.rotated': 'You could not stay on a to-do and the app moved you on',
		'task.switched': 'The current task changes',
		'task.created': 'A task is added',
		'task.updated': 'A task is changed or moved',
		'task.deleted': 'A task is deleted'
	};

	const enabled = $derived(parseEvents(events));
	let message = $state<string | null>(null);
	let saved = $state(false);
	let customOpen = $state(false);
	// A budget that is none of the chips shows its number
	const showCustom = $derived(customOpen || (budget !== null && !BUDGET_PRESETS.includes(budget)));

	async function save(event: Event) {
		saved = false;
		const parsed = parseSettingsForm(new FormData(event.currentTarget as HTMLFormElement));
		message = await saveSettings(
			parsed.ok ? { ok: true, value: agentPatch(parsed.value) } : parsed
		);
		saved = message === null;
	}

	async function chooseBudget(dailyTokenBudget: number | null) {
		saved = false;
		customOpen = false;
		message = await saveSettings({ ok: true, value: { dailyTokenBudget } });
		saved = message === null;
	}
</script>

<form class="space-y-5" onchange={save} onsubmit={(event) => event.preventDefault()}>
	<fieldset class="grid gap-2 sm:grid-cols-3">
		<legend class="mb-2 font-medium">How much may it do on its own</legend>
		{#each AUTONOMY as level (level)}
			<label
				class="has-checked:border-primary has-checked:bg-muted flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-3"
			>
				<span class="flex items-center gap-2">
					<input
						type="radio"
						name="autonomy"
						value={level}
						class="accent-primary size-4 shrink-0"
						checked={autonomy === level}
					/>
					<span class="font-medium">{AUTONOMY_TEXT[level].label}</span>
				</span>
				<span class="text-muted-foreground text-sm">{AUTONOMY_TEXT[level].detail}</span>
			</label>
		{/each}
	</fieldset>

	<details class="rounded-lg border">
		<summary class="min-h-11 cursor-pointer px-3 py-3 font-medium">Advanced</summary>
		<div class="space-y-5 border-t p-3">
			<fieldset class="space-y-3">
				<legend class="mb-1 font-medium">It may react when</legend>
				{#each REACTION_EVENTS as type (type)}
					<label class="flex min-h-8 cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							name="event"
							value={type}
							class="accent-primary size-4"
							checked={enabled.includes(type)}
						/>
						<span>{EVENT_TEXT[type]}</span>
					</label>
				{/each}
				<p class="text-muted-foreground text-sm">
					Everything is logged either way. At most 6 unprompted reactions an hour.
				</p>
			</fieldset>

			<fieldset class="space-y-2">
				<legend class="mb-1 font-medium">Quiet hours</legend>
				<div class="flex flex-wrap items-center gap-2">
					<TimeInput
						name="quietStart"
						value={formatClock24(quietStart)}
						label="Quiet hours start"
					/>
					<span>to</span>
					<TimeInput name="quietEnd" value={formatClock24(quietEnd)} label="Quiet hours end" />
				</div>
				<p class="text-muted-foreground text-sm">
					No unprompted reactions in this window. Your own messages always get an answer.
				</p>
			</fieldset>

			<div class="space-y-2">
				<p class="font-medium">Daily budget for unprompted reactions</p>
				<PresetChips
					label="Daily token budget"
					options={[
						{ value: null, label: budgetChip(null) },
						...BUDGET_PRESETS.map((value) => ({ value, label: budgetChip(value) }))
					]}
					value={showCustom ? -1 : budget}
					onselect={chooseBudget}
				/>
				{#if showCustom}
					<div class="flex items-center gap-2">
						<NumberInput
							name="budget"
							min={1}
							max={100000}
							step={10}
							value={budget ? budget / 1000 : 10}
							label="Daily budget in thousand tokens"
						/>
						<span>thousand tokens</span>
					</div>
				{:else}
					<button
						type="button"
						class="text-muted-foreground min-h-11 text-sm underline md:min-h-8"
						onclick={() => (customOpen = true)}>Custom amount</button
					>
					<input type="hidden" name="budget" value={budget ? budget / 1000 : ''} />
				{/if}
				<p class="text-muted-foreground text-sm">
					When it is used up the assistant stays silent until tomorrow. Chat keeps working.
				</p>
			</div>
		</div>
	</details>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</form>
