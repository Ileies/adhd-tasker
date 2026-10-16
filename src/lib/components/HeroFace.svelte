<script lang="ts">
	import { FACE_ANSWERS, type FaceAnswer } from '#lib/struggle.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	/**
	 * The question at the end of a Face it session: the to-do was pushed away again and again, now the user decides.
	 * A smaller first step asks for one line, moving the due date for how far.
	 */
	let {
		onAnswer
	}: {
		onAnswer: (answer: FaceAnswer, detail: { step?: string; days?: number }) => void;
	} = $props();

	let stage = $state<'ask' | 'step' | 'move'>('ask');
	let step = $state('');

	const chipClass = 'h-14 border-current bg-transparent px-6 text-lg hover:bg-current/10';
	const MOVES = [
		{ days: 1, label: 'Tomorrow' },
		{ days: 3, label: 'In 3 days' },
		{ days: 7, label: 'Next week' }
	];

	function pick(answer: FaceAnswer) {
		if (answer === 'smaller') stage = 'step';
		else if (answer === 'move') stage = 'move';
		else onAnswer(answer, {});
	}
</script>

<div class="flex max-w-3xl flex-col gap-3">
	{#if stage === 'ask'}
		<div class="flex flex-wrap gap-2" role="group" aria-label="What now?">
			{#each FACE_ANSWERS as option (option.answer)}
				<Button variant="outline" class={chipClass} onclick={() => pick(option.answer)}>
					{option.label}
				</Button>
			{/each}
		</div>
	{:else if stage === 'step'}
		<form
			class="flex max-w-xl flex-col gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				if (step.trim()) onAnswer('smaller', { step: step.trim() });
			}}
		>
			<p class="text-xl">What is the first small step?</p>
			<Input
				bind:value={step}
				aria-label="The first small step"
				placeholder="Open the file and write one line"
				class="h-14 border-current bg-transparent px-4 text-lg placeholder:text-current/60"
			/>
			<div class="flex gap-2">
				<Button type="submit" variant="outline" class={chipClass} disabled={!step.trim()}>
					Save it
				</Button>
				<Button
					type="button"
					variant="ghost"
					class="h-14 px-4 text-lg hover:bg-current/10"
					onclick={() => (stage = 'ask')}
				>
					Back
				</Button>
			</div>
		</form>
	{:else}
		<p class="text-xl">Move its due date to when?</p>
		<div class="flex flex-wrap gap-2">
			{#each MOVES as move (move.days)}
				<Button
					variant="outline"
					class={chipClass}
					onclick={() => onAnswer('move', { days: move.days })}
				>
					{move.label}
				</Button>
			{/each}
			<Button
				variant="ghost"
				class="h-14 px-4 text-lg hover:bg-current/10"
				onclick={() => (stage = 'ask')}
			>
				Back
			</Button>
		</div>
	{/if}
</div>
