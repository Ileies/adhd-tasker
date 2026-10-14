<script lang="ts">
	import { Check, Plus, Trash2 } from '@lucide/svelte';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import AgentStrip from '#lib/components/AgentStrip.svelte';
	import SilenceLine from '#lib/components/SilenceLine.svelte';
	import { formatClock, formatDuration } from '#lib/format.js';

	const NEXT_COUNT = 4;
	const MISSED_COUNT = 3;

	let {
		upcoming,
		missed,
		now,
		onDone,
		onExtend,
		onDrop
	}: {
		upcoming: Task[];
		missed: Task[];
		now: number;
		onDone: (task: Task) => void;
		onExtend: (task: Task) => void;
		onDrop: (task: Task) => void;
	} = $props();

	const shown = $derived(upcoming.slice(0, NEXT_COUNT));
	const hidden = $derived(upcoming.length - shown.length);
</script>

<aside
	class="bg-background flex flex-col gap-8 border-t p-6 pt-8 sm:px-10 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-20"
>
	<div class="tabular text-5xl font-semibold" aria-label="Current time">{formatClock(now)}</div>

	<AgentStrip />

	<section>
		<h2 class="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">Next</h2>
		{#if shown.length === 0}
			<p class="text-muted-foreground">Nothing more today.</p>
		{:else}
			<ol class="flex flex-col gap-4">
				{#each shown as task, index (task.id)}
					<li class="flex gap-4">
						<div
							class="tabular w-14 shrink-0 pt-0.5 {index === 0
								? 'text-xl font-semibold'
								: 'text-muted-foreground'}"
						>
							{formatClock(task.startTime)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="break-words {index === 0 ? 'text-xl font-semibold' : 'text-base'}">
								{task.title}
							</div>
							{#if index === 0 && task.description}
								<p class="text-muted-foreground mt-1 line-clamp-3 text-sm">{task.description}</p>
							{/if}
							<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-sm">
								<span>in {formatDuration(task.startTime - now)}</span>
								<span>{formatDuration(task.duration)}</span>
								<PriorityMeter priority={task.priority} showLabel={false} />
							</div>
						</div>
					</li>
				{/each}
			</ol>
			{#if hidden > 0}
				<p class="text-muted-foreground mt-4 text-sm">+{hidden} later today</p>
			{/if}
		{/if}
	</section>

	{#if missed.length > 0}
		<section>
			<h2 class="text-muted-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
				Missed
			</h2>
			<ul class="flex flex-col gap-3">
				{#each missed.slice(0, MISSED_COUNT) as task (task.id)}
					<li class="bg-muted/40 rounded-lg border p-3">
						<div class="break-words">{task.title}</div>
						<div class="mt-2 flex flex-wrap gap-2">
							<Button size="sm" variant="secondary" onclick={() => onDone(task)}
								><Check />Done</Button
							>
							<Button size="sm" variant="ghost" onclick={() => onExtend(task)}
								><Plus />15 min</Button
							>
							<Button
								size="sm"
								variant="ghost"
								class="text-muted-foreground"
								onclick={() => onDrop(task)}><Trash2 />Drop</Button
							>
						</div>
					</li>
				{/each}
			</ul>
			{#if missed.length > MISSED_COUNT}
				<p class="text-muted-foreground mt-3 text-sm">+{missed.length - MISSED_COUNT} more</p>
			{/if}
		</section>
	{/if}

	<!-- On phones the line is in the hero, the rail sits below the fold -->
	<SilenceLine class="text-muted-foreground mt-auto hidden lg:flex" />
</aside>
