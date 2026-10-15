<script lang="ts">
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import AgentStrip from '#lib/components/AgentStrip.svelte';
	import SilenceLine from '#lib/components/SilenceLine.svelte';
	import ClockReadout from '#lib/components/ClockReadout.svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { doneLine, laterLine, missedLine, nextAlarmLine, timeRange } from '#lib/rail.js';
	import { deviceTimezone, type DateKey } from '#lib/time.js';

	const NEXT_COUNT = 4;

	let {
		upcoming,
		missedCount,
		now,
		today,
		timezone = null,
		done,
		headsUp = false,
		onEdit,
		onTriage,
		sample = false,
		onClearSample
	}: {
		upcoming: Task[];
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
		onTriage: () => void;
		/** The plan holds the sample day: say so and offer to clear it. */
		sample?: boolean;
		onClearSample?: () => void;
	} = $props();

	const shown = $derived(upcoming.slice(0, NEXT_COUNT));
	const later = $derived(laterLine(upcoming.length - shown.length));
	const doneText = $derived(doneLine(done));
	const missedText = $derived(missedLine(missedCount));
	const alarm = $derived.by(() => {
		// The clock prop ticks every second, so an alarm that rang leaves the line
		void now;
		return nextAlarmLine(tasker.schedule.alarms, Date.now(), today, timezone ?? deviceTimezone());
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
				{#each shown as task, index (task.id)}
					<li>
						<button
							type="button"
							class="hover:bg-muted/60 focus-visible:ring-ring -mx-3 flex w-[calc(100%+1.5rem)] gap-4 rounded-lg px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
							onclick={() => onEdit(task)}
						>
							<span
								class="tabular w-14 shrink-0 pt-0.5 {index === 0
									? 'text-xl font-semibold'
									: 'text-muted-foreground'}"
							>
								{formatClock(task.startTime)}
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="block break-words {index === 0
										? `text-xl ${headsUp ? 'font-bold' : 'font-semibold'}`
										: 'text-base'}"
								>
									{task.title}
								</span>
								{#if index === 0 && task.description}
									<span class="text-muted-foreground mt-1 line-clamp-3 block text-sm"
										>{task.description}</span
									>
								{/if}
								<span
									class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-sm"
								>
									<span class="tabular">{timeRange(task)}</span>
									{#if index === 0}
										<span>in {formatDuration(task.startTime - now)}</span>
									{/if}
									<PriorityMeter priority={task.priority} showLabel={false} />
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

	{#if alarm}
		<p class="text-muted-foreground">{alarm}</p>
	{/if}

	{#if missedText}
		<Button variant="outline" class="h-11 justify-start" onclick={onTriage}>{missedText}</Button>
	{/if}

	{#if sample}
		<p class="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
			Sample day.
			<Button
				variant="link"
				class="text-foreground h-auto p-0 text-sm"
				onclick={() => onClearSample?.()}>Clear it</Button
			>
		</p>
	{/if}

	<!-- On phones the line is in the hero, the rail sits below the fold -->
	<SilenceLine class="text-muted-foreground mt-auto hidden lg:flex" />
</aside>
