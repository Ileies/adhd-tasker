<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { Todo } from '#lib/core/repo.js';
	import { panelTodos, todoLine } from '#lib/todoform.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		todos,
		today,
		onOpen,
		onNow,
		onDone
	}: {
		todos: Todo[];
		today: string;
		/** Opens the sheet of the to-do. */
		onOpen: (todo: Todo) => void;
		/** "Do this now". */
		onNow: (todo: Todo) => void;
		onDone: (todo: Todo) => void;
	} = $props();

	const open = $derived(panelTodos(todos));
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="To do">
	<h2 class="text-muted-foreground px-4 pt-4 pb-2 text-sm font-semibold tracking-wide uppercase">
		To do
	</h2>
	{#if open.length === 0}
		<p class="text-muted-foreground px-4 pb-4">
			Nothing to do. Add a line above, a title is enough.
		</p>
	{:else}
		<ul class="divide-y overflow-y-auto">
			{#each open as todo (todo.id)}
				{@const line = todoLine(todo, today)}
				<li class="flex items-center gap-2 px-4 py-2">
					<button
						type="button"
						class="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center text-left"
						onclick={() => onOpen(todo)}
					>
						<span class="flex items-center gap-2">
							<span class="truncate font-medium">{todo.title}</span>
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs {priorityStyle[todo.priority]
									.chip}"
							>
								{priorityStyle[todo.priority].label}
							</span>
						</span>
						{#if line}
							<span class="text-muted-foreground truncate text-xs">{line}</span>
						{/if}
					</button>
					<Button variant="outline" size="sm" class="shrink-0" onclick={() => onNow(todo)}>
						Do this now
					</Button>
					<Button
						variant="outline"
						size="icon"
						class="shrink-0"
						aria-label="Mark {todo.title} as done"
						onclick={() => onDone(todo)}
					>
						<Check />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
