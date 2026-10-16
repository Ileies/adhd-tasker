<script lang="ts">
	import {
		MAX_GUESS,
		PACE_CHOICES,
		checkChips,
		chipLabel,
		followUp,
		type CheckChip,
		type CheckData,
		type Pace
	} from '#lib/checks.js';
	import type { Todo } from '#lib/core/repo.js';
	import { formatDuration } from '#lib/format.js';
	import { SIZE_CHIPS } from '#lib/todoform.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';

	/**
	 * "How far is Study B?" inside the hero: one tap answers, a slow pace or an unknown size is asked once more.
	 * It is also the question after "I was working on it" (`worked`), where Keep going is as good as any answer.
	 */
	let {
		todo,
		sessionLength,
		keeps = 0,
		sizeAsked = false,
		worked = false,
		minutes,
		onAnswer
	}: {
		todo: Todo;
		/** The minutes the session was meant to run, what the offered steps are sized by. */
		sessionLength: number;
		/** Keep going answers in a row so far. */
		keeps?: number;
		sizeAsked?: boolean;
		worked?: boolean;
		/** The minutes this answer counts, read when it is given. */
		minutes: () => number;
		onAnswer: (data: CheckData) => void;
	} = $props();

	let stage = $state<'ask' | 'other' | 'size' | 'pace'>('ask');
	let pending = $state<CheckData | null>(null);
	let other = $state(0);

	const chips = $derived(
		checkChips({ progress: todo.progress, minutes: sessionLength, size: todo.estimate, keeps })
	);
	const chipClass = 'h-14 border-current bg-transparent px-6 text-lg hover:bg-current/10';

	function answer(chip: CheckChip | { kind: 'other'; progress: number }) {
		const spent = minutes();
		const keep = chip.kind === 'keep';
		const after = chip.kind === 'keep' ? todo.progress : chip.progress;
		const data: CheckData = {
			before: todo.progress,
			after,
			minutes: spent,
			...(keep && { keep: true as const }),
			...(worked && { worked: true as const })
		};
		const next = keep
			? null
			: followUp({ before: todo.progress, after, minutes: spent, size: todo.estimate, sizeAsked });
		if (next === null) return onAnswer(data);
		pending = data;
		stage = next;
	}

	const finish = (extra: { size: number | null } | { pace: Pace }) =>
		pending && onAnswer({ ...pending, ...extra });
</script>

<div class="flex max-w-3xl flex-col gap-3">
	{#if stage === 'ask'}
		<div class="flex flex-wrap gap-2" role="group" aria-label="How far is it?">
			{#each chips as chip (chip.kind + ('progress' in chip ? chip.progress : ''))}
				<Button variant="outline" class={chipClass} onclick={() => answer(chip)}>
					{chipLabel(chip)}
				</Button>
			{/each}
			<Button
				variant="outline"
				class={chipClass}
				onclick={() => {
					other = todo.progress;
					stage = 'other';
				}}
			>
				Other
			</Button>
		</div>
	{:else if stage === 'other'}
		<div class="flex max-w-md flex-col gap-4">
			<p class="tabular text-3xl font-bold">{other} %</p>
			<Slider
				type="single"
				min={0}
				max={MAX_GUESS}
				step={5}
				bind:value={other}
				aria-label="Progress"
			/>
			<div class="flex gap-2">
				<Button
					variant="outline"
					class={chipClass}
					onclick={() => answer({ kind: 'other', progress: other })}
				>
					Set
				</Button>
				<Button
					variant="ghost"
					class="h-14 px-4 text-lg hover:bg-current/10"
					onclick={() => (stage = 'ask')}
				>
					Back
				</Button>
			</div>
		</div>
	{:else if stage === 'size'}
		<p class="text-xl">How big is all of it?</p>
		<div class="flex flex-wrap gap-2">
			{#each SIZE_CHIPS as size (size)}
				<Button variant="outline" class={chipClass} onclick={() => finish({ size })}>
					{formatDuration(size)}
				</Button>
			{/each}
			<Button variant="outline" class={chipClass} onclick={() => finish({ size: null })}>
				Not sure
			</Button>
		</div>
	{:else}
		<p class="text-xl">Slower than planned. What happened?</p>
		<div class="flex flex-wrap gap-2">
			{#each PACE_CHOICES as choice (choice.pace)}
				<Button variant="outline" class={chipClass} onclick={() => finish({ pace: choice.pace })}>
					{choice.label}
				</Button>
			{/each}
		</div>
	{/if}
</div>
