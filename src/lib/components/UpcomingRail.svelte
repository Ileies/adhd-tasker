<script lang="ts">
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import AgentStrip from '#lib/components/AgentStrip.svelte';
	import QuickAlarmBar from '#lib/components/QuickAlarmBar.svelte';
	import SilenceLine from '#lib/components/SilenceLine.svelte';
	import ClockReadout from '#lib/components/ClockReadout.svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import type { Todo } from '#lib/core/repo.js';
	import { doneLine, laterLine, missedLine, alarmLines, nextItems } from '#lib/rail.js';
	import { deviceTimezone, type DateKey } from '#lib/time.js';

	const NEXT_COUNT = 2;

	let {
		upcoming,
		todos = [],
		missedCount,
		now,
		today,
		timezone = null,
		done,
		headsUp = false,
		onEdit,
		onOpenTodo = () => {},
		onTriage
	}: {
		upcoming: Task[];
		/** Every to-do: the ones due today at a time are listed at that time. */
		todos?: Todo[];
		/** Tasks that ran out without an answer, decided one by one in the triage sheet. */
		missedCount: number;
		now: number;
		today: DateKey;
		timezone?: string | null;
		/** How many tasks today were finished. */
		done: number;
		/** The hero shows the heads-up line, so the first item gets the weight. */
		headsUp?: boolean;
		onEdit: (task: Task) => void;
		/** Opens a to-do that is due today at a time. */
		onOpenTodo?: (todo: Todo) => void;
		onTriage: () => void;
	} = $props();

	// Tasks at their start, to-dos due today at a time at their due time
	const items = $derived(nextItems(upcoming, todos, today, now));
	const shown = $derived(items.slice(0, NEXT_COUNT));
	const later = $derived(laterLine(items.length - shown.length));
	const doneText = $derived(doneLine(done));
	const missedText = $derived(missedLine(missedCount));
	const alarms = $derived.by(() => {
		// The clock prop ticks every second, so an alarm that rang leaves the line
		void now;
		return alarmLines(tasker.schedule.alarms, Date.now(), today, timezone ?? deviceTimezone());
	});
</script>

<aside
	class="bg-background flex flex-col gap-8 border-t p-6 pt-8 sm:px-10 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-20"
>
	<div>
		{#if tasker.settings.showClock}
			<ClockReadout {timezone} seconds class="text-5xl font-semibold" />
		{/if}
		{#if doneText}
			<p class="text-muted-foreground mt-2">{doneText}</p>
		{/if}
	</div>

	<AgentStrip />

	<section>
		<h2 class="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">Next</h2>
		{#if shown.length === 0}
			<p class="text-muted-foreground">Nothing more today.</p>
		{:else}
			<ol class="flex flex-col gap-2">
				{#each shown as item, index (`${item.kind}:${item.kind === 'task' ? item.task.id : item.todo.id}`)}
					{@const entry = item.kind === 'task' ? item.task : item.todo}
					<li>
						<button
							type="button"
							class="hover:bg-muted/60 focus-visible:ring-ring -mx-3 flex w-[calc(100%+1.5rem)] gap-4 rounded-lg px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
							onclick={() => (item.kind === 'task' ? onEdit(item.task) : onOpenTodo(item.todo))}
						>
							<span
								class="tabular w-14 shrink-0 pt-0.5 {index === 0
									? 'text-xl font-semibold'
									: 'text-muted-foreground'}"
							>
								{formatClock(item.at)}
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="block break-words {index === 0
										? `text-xl ${headsUp && item.kind === 'task' ? 'font-bold' : 'font-semibold'}`
										: 'text-base'}"
								>
									{entry.title}
								</span>
								{#if index === 0 && entry.description}
									<span class="text-muted-foreground mt-1 line-clamp-3 block text-sm"
										>{entry.description}</span
									>
								{/if}
								<span
									class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-sm"
								>
									{#if item.kind === 'todo'}
										<span>Due{index === 0 ? ` in ${formatDuration(item.at - now)}` : ''}</span>
									{:else if index === 0}
										<span>in {formatDuration(item.at - now)}</span>
									{/if}
									<PriorityMeter priority={entry.priority} showLabel={false} />
								</span>
							</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if later}
				<Button variant="link" class="text-muted-foreground mt-2 h-auto p-0 text-sm" href="/edit"
					>{later}</Button
				>
			{/if}
		{/if}
	</section>

	{#if alarms.length > 0}
		<div class="text-muted-foreground flex flex-col gap-1">
			{#each alarms as line, index (index)}
				<p>{line}</p>
			{/each}
		</div>
	{/if}

	{#if missedText}
		<Button variant="outline" class="h-11 justify-start" onclick={onTriage}>{missedText}</Button>
	{/if}

	<div class="mt-auto flex flex-col gap-4">
		<QuickAlarmBar />
		<!-- On phones the line is in the hero, the rail sits below the fold -->
		<SilenceLine class="text-muted-foreground hidden lg:flex" />
	</div>
</aside>
