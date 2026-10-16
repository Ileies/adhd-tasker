<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { Task, Todo } from '#lib/core/repo.js';
	import { fitWords, type Fitting } from '#lib/capacity.js';
	import { formatClock } from '#lib/format.js';
	import { formatDay } from '#lib/time.js';
	import { panelGroups, todoLine } from '#lib/todoform.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		todos,
		tasks = [],
		fits = new Map(),
		today,
		onOpen,
		onNow,
		onDone
	}: {
		todos: Todo[];
		/** The tasks the client knows, to find the appointments to-dos prepare for. */
		tasks?: Pick<Task, 'id' | 'title' | 'date' | 'startTime'>[];
		/** Whether each to-do with a due date fits into the free time until then (`fittings`). */
		fits?: Map<number, Fitting>;
		today: string;
		/** Opens the sheet of the to-do. */
		onOpen: (todo: Todo) => void;
		/** "Do this now". */
		onNow: (todo: Todo) => void;
		onDone: (todo: Todo) => void;
	} = $props();

	const groups = $derived(panelGroups(todos, tasks));
	const empty = $derived(groups.forAppointments.length === 0 && groups.other.length === 0);
</script>

{#snippet row(todo: Todo)}
	{@const line = todoLine(todo, today)}
	{@const fit = fits.get(todo.id)}
	{@const words = fitWords(fit)}
	<li class="flex items-center gap-2 px-4 py-2">
		<button
			type="button"
			class="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center text-left"
			onclick={() => onOpen(todo)}
		>
			<span class="flex items-center gap-2">
				<span class="truncate font-medium">{todo.title}</span>
				<span class="shrink-0 rounded-full px-2 py-0.5 text-xs {priorityStyle[todo.priority].chip}">
					{priorityStyle[todo.priority].label}
				</span>
				{#if words}
					<span
						class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {fit?.fit === 'no-fit'
							? 'bg-destructive/15 text-destructive'
							: 'bg-warning/20'}"
					>
						{words}
					</span>
				{/if}
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
{/snippet}

<section class="flex h-full min-h-0 flex-col overflow-y-auto" aria-label="To do">
	<h2 class="text-muted-foreground px-4 pt-4 pb-2 text-sm font-semibold tracking-wide uppercase">
		To do
	</h2>
	{#if empty}
		<p class="text-muted-foreground px-4 pb-4">
			Nothing to do. Add a line above, a title is enough.
		</p>
	{:else}
		{#each groups.forAppointments as group (group.appointment.id)}
			<h3 class="text-muted-foreground px-4 pt-3 pb-1 text-sm font-medium">
				For {group.appointment.title}, {formatDay(group.appointment.date, today)}
				{formatClock(group.appointment.startTime)}
			</h3>
			<ul class="divide-y">
				{#each group.todos as todo (todo.id)}{@render row(todo)}{/each}
			</ul>
		{/each}
		{#if groups.other.length > 0}
			{#if groups.forAppointments.length > 0}
				<h3 class="text-muted-foreground px-4 pt-3 pb-1 text-sm font-medium">Other</h3>
			{/if}
			<ul class="divide-y">
				{#each groups.other as todo (todo.id)}{@render row(todo)}{/each}
			</ul>
		{/if}
	{/if}
</section>
