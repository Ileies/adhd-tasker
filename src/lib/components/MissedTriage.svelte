<script lang="ts">
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { timeRange } from '#lib/rail.js';

	let {
		open = $bindable(false),
		missed,
		onDone,
		onLater,
		onTomorrow,
		onWhenTime,
		onDrop
	}: {
		open?: boolean;
		/** Tasks that ran out without an answer. Each decision removes one, so the first is always the one to ask about. */
		missed: Task[];
		onDone: (task: Task) => void;
		onLater: (task: Task) => void;
		onTomorrow: (task: Task) => void;
		/** The task becomes a to-do of its length. */
		onWhenTime: (task: Task) => void;
		onDrop: (task: Task) => void;
	} = $props();

	// How many there were when the sheet opened, so "1 of 2" counts up while the list shrinks
	let total = $state(0);
	$effect(() => {
		if (open && total === 0) total = missed.length;
		if (!open) total = 0;
	});

	const task = $derived(missed[0] ?? null);
	const position = $derived(Math.max(1, total - missed.length + 1));

	// Nothing left to decide: the sheet has done its job
	$effect(() => {
		if (open && !task) open = false;
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		{#if task}
			<Dialog.Header>
				<Dialog.Description>{position} of {Math.max(total, position)}</Dialog.Description>
				<Dialog.Title class="text-2xl break-words">Did you do {task.title}?</Dialog.Title>
				<p class="tabular text-muted-foreground">{timeRange(task)}</p>
			</Dialog.Header>
			<div class="flex flex-col gap-2">
				<Button size="lg" class="h-12 text-lg" onclick={() => onDone(task)}>Done</Button>
				<Button size="lg" variant="secondary" class="h-12 text-lg" onclick={() => onLater(task)}>
					Later today
				</Button>
				<Button size="lg" variant="secondary" class="h-12 text-lg" onclick={() => onTomorrow(task)}>
					Tomorrow
				</Button>
				<Button size="lg" variant="secondary" class="h-12 text-lg" onclick={() => onWhenTime(task)}>
					Do it when there is time
				</Button>
				<Button
					size="lg"
					variant="ghost"
					class="text-muted-foreground h-12 text-lg"
					onclick={() => onDrop(task)}>Drop</Button
				>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
