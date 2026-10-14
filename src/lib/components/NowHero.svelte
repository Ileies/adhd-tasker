<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import { formatClock, formatCountdown } from '#lib/format.js';
	import { minutesLeft } from '#lib/priority.js';
	import { urgencyLevel, urgencySurface } from '#lib/urgency.js';

	let {
		task,
		next,
		now,
		reason,
		onDone
	}: { task: Task | null; next: Task | null; now: number; reason: string | null; onDone: (task: Task) => void } = $props();

	const left = $derived(task ? minutesLeft(task, now) : 0);
	const progress = $derived(task ? Math.min(100, Math.max(0, 100 - (100 * left) / task.duration)) : 0);
	const surface = $derived(task ? urgencySurface[urgencyLevel(task.priority, left, task.duration)] : urgencySurface[0]);
</script>

<section
	class="flex min-h-svh flex-col justify-center px-6 pt-20 pb-10 transition-colors duration-[1500ms] sm:px-12 lg:min-h-full {surface}"
	aria-live="polite"
>
	{#if task}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-lg opacity-90">
				<PriorityMeter priority={task.priority} />
				<span class="tabular">{formatClock(task.startTime)} - {formatClock(task.startTime + task.duration)}</span>
			</div>

			<h1 class="text-display line-clamp-3 font-bold break-words">{task.title}</h1>

			{#if task.description}
				<p class="line-clamp-4 max-w-3xl text-xl leading-relaxed opacity-90 md:text-2xl">{task.description}</p>
			{/if}

			<div>
				<div class="tabular text-clock font-bold">{formatCountdown(Math.max(0, left))}</div>
				<div class="mt-1 text-lg opacity-90">left</div>
			</div>

			<div class="h-3 max-w-xl overflow-hidden rounded-full bg-current/20" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Time used">
				<div class="h-full rounded-full bg-current transition-[width] duration-1000" style="width: {progress}%"></div>
			</div>

			<div>
				<Button
					size="lg"
					class="h-16 bg-foreground px-10 text-xl text-background hover:bg-foreground/85 [&_svg:not([class*='size-'])]:size-6"
					onclick={() => onDone(task)}
				>
					<Check />
					Done
				</Button>
			</div>

			{#if reason}
				<p class="text-base opacity-80">{reason}</p>
			{/if}

			<!-- The rail sits below the fold on small screens, so hint at what is next -->
			{#if next}
				<p class="truncate text-base opacity-90 lg:hidden">
					Next <span class="tabular font-semibold">{formatClock(next.startTime)}</span> {next.title}
				</p>
			{/if}
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Free time</h1>
			{#if next}
				<p class="text-xl opacity-90 md:text-2xl">Next: {next.title}</p>
				<div>
					<div class="tabular text-clock font-bold">{formatCountdown(next.startTime - now)}</div>
					<div class="mt-1 text-lg opacity-90">until it starts at {formatClock(next.startTime)}</div>
				</div>
			{:else}
				<p class="text-xl opacity-90 md:text-2xl">Nothing else is planned.</p>
			{/if}
			{#if reason}
				<p class="text-base opacity-80">{reason}</p>
			{/if}
		</div>
	{/if}
</section>
