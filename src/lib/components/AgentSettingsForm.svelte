<script lang="ts">
	import { enhance } from '$app/forms';
	import { AUTONOMY, REACTION_EVENTS, parseEvents, type Autonomy } from '#lib/guardrails.js';
	import { formatClock } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const {
		autonomy,
		events,
		quietStart,
		quietEnd,
		budget,
		message,
		saved
	}: {
		autonomy: Autonomy;
		events: string;
		quietStart: number;
		quietEnd: number;
		budget: number | null;
		message?: string;
		saved?: boolean;
	} = $props();

	const AUTONOMY_TEXT: Record<Autonomy, { label: string; detail: string }> = {
		observe: { label: 'Observe', detail: 'It only logs what happens and never reacts by itself.' },
		suggest: {
			label: 'Suggest',
			detail:
				'It may show a note or a question on the Now screen, but never changes your plan by itself.'
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
		'task.switched': 'The current task changes',
		'task.created': 'A task is added',
		'task.updated': 'A task is changed or moved',
		'task.deleted': 'A task is deleted'
	};

	const enabled = $derived(parseEvents(events));
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/saveAgent"
	class="space-y-5"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<fieldset class="space-y-3">
		<legend class="mb-1 font-medium">How much may it do on its own</legend>
		{#each AUTONOMY as level (level)}
			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="radio"
					name="autonomy"
					value={level}
					class="accent-primary mt-1 size-4 shrink-0"
					checked={autonomy === level}
				/>
				<span>
					<span class="font-medium">{AUTONOMY_TEXT[level].label}</span>
					<span class="text-muted-foreground block text-sm">{AUTONOMY_TEXT[level].detail}</span>
				</span>
			</label>
		{/each}
	</fieldset>

	<fieldset class="space-y-3">
		<legend class="mb-1 font-medium">It may react when</legend>
		{#each REACTION_EVENTS as type (type)}
			<label class="flex cursor-pointer items-center gap-3">
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
			Everything is logged either way. At most 6 unprompted reactions per hour, at least 3 minutes
			apart.
		</p>
	</fieldset>

	<fieldset class="space-y-2">
		<legend class="mb-1 font-medium">Quiet hours</legend>
		<div class="flex items-center gap-2">
			<Input
				type="time"
				name="quietStart"
				value={formatClock(quietStart)}
				class="w-32"
				aria-label="Quiet hours start"
			/>
			<span>to</span>
			<Input
				type="time"
				name="quietEnd"
				value={formatClock(quietEnd)}
				class="w-32"
				aria-label="Quiet hours end"
			/>
		</div>
		<p class="text-muted-foreground text-sm">
			No unprompted reactions in this window. Your own messages always get an answer.
		</p>
	</fieldset>

	<div class="space-y-2">
		<label class="font-medium" for="budget">Daily budget for unprompted reactions</label>
		<div class="flex items-center gap-2">
			<Input
				id="budget"
				type="number"
				name="budget"
				min="1"
				step="1"
				value={budget ? budget / 1000 : ''}
				placeholder="No limit"
				class="w-32"
			/>
			<span>thousand tokens</span>
		</div>
		<p class="text-muted-foreground text-sm">
			When it is used up the assistant stays silent until tomorrow. Chat keeps working.
		</p>
	</div>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}

	<Button type="submit" disabled={busy}>Save</Button>
</form>
