<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { STUCK_REASONS, type StuckReason } from '#lib/anchoring.js';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import { formatClock, formatCountdown } from '#lib/format.js';
	import { endedAgo, headsUpLine, type HeroState } from '#lib/now.js';
	import { minutesLeft } from '#lib/priority.js';
	import { urgencyLevel, urgencySurface } from '#lib/urgency.js';

	let {
		hero,
		now,
		reason,
		headsUp,
		onDone,
		onStuck,
		onExtend,
		onLater
	}: {
		hero: HeroState<Task>;
		now: number;
		reason: string | null;
		headsUp: Task | null;
		onDone: (task: Task) => void;
		onStuck: (task: Task, reason: StuckReason) => void;
		onExtend: (task: Task) => void;
		onLater: (task: Task) => void;
	} = $props();

	// Time up without a current task owns the whole hero, with one it is a bar above that task
	const timeUp = $derived(hero.kind === 'time-up' && hero.current === null ? hero : null);
	const bar = $derived(hero.kind === 'time-up' && hero.current !== null ? hero : null);
	// The task the hero is about: the one running, or null when nothing is
	const task = $derived(
		hero.kind === 'active' || hero.kind === 'wrapping-up'
			? hero.task
			: hero.kind === 'time-up'
				? hero.current
				: null
	);
	const next = $derived(
		hero.kind === 'free' || hero.kind === 'wrapping-up' || hero.kind === 'time-up'
			? hero.next
			: null
	);

	// The stuck panel belongs to one task, it closes when another one becomes current
	let stuckFor = $state<{ id: number; reason: StuckReason | null } | null>(null);
	const stuck = $derived(task && stuckFor?.id === task.id ? stuckFor : null);

	function choose(reason: StuckReason) {
		if (!task) return;
		stuckFor = { id: task.id, reason };
		onStuck(task, reason);
	}

	const left = $derived(task ? minutesLeft(task, now) : 0);
	const progress = $derived(
		task ? Math.min(100, Math.max(0, 100 - (100 * left) / task.duration)) : 0
	);
	const surface = $derived(
		timeUp
			? urgencySurface[urgencyLevel(timeUp.ended.priority, -timeUp.over, timeUp.ended.duration)]
			: task
				? urgencySurface[urgencyLevel(task.priority, left, task.duration)]
				: urgencySurface[0]
	);

	const doneClass =
		"bg-foreground text-background hover:bg-foreground/85 h-16 px-10 text-xl [&_svg:not([class*='size-'])]:size-6";
	const secondaryClass = 'h-16 border-current bg-transparent px-8 text-xl hover:bg-current/10';
	const barButtonClass = 'h-9 border-current bg-transparent px-4 text-base hover:bg-current/10';
</script>

<section
	class="flex min-h-svh flex-col justify-center px-6 pt-20 pb-10 transition-colors duration-[1500ms] sm:px-12 md:min-h-[60svh] lg:min-h-full {surface}"
	aria-live="polite"
>
	{#if timeUp}
		{@const ended = timeUp.ended}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-lg opacity-90">
				<span class="font-semibold">Time is up</span>
				<span class="tabular">{endedAgo(timeUp.over)}</span>
			</div>

			<h1 class="text-display line-clamp-3 font-bold break-words">{ended.title}</h1>

			<div class="flex flex-wrap items-center gap-3">
				<Button size="lg" class={doneClass} onclick={() => onDone(ended)}>
					<Check />
					Done
				</Button>
				<Button size="lg" variant="outline" class={secondaryClass} onclick={() => onExtend(ended)}>
					15 more min
				</Button>
				<Button size="lg" variant="outline" class={secondaryClass} onclick={() => onLater(ended)}>
					Move to later
				</Button>
			</div>

			{#if next}
				<p class="truncate text-xl opacity-90">
					Next <span class="tabular font-semibold">{formatClock(next.startTime)}</span>
					{next.title}
				</p>
			{/if}
		</div>
	{:else if task}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			{#if bar}
				<div
					class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-current/30 px-4 py-3"
					role="status"
				>
					<span class="text-lg">Time for {bar.ended.title} is up.</span>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" class={barButtonClass} onclick={() => onDone(bar.ended)}>
							Done
						</Button>
						<Button variant="outline" class={barButtonClass} onclick={() => onExtend(bar.ended)}>
							15 more min
						</Button>
						<Button variant="outline" class={barButtonClass} onclick={() => onLater(bar.ended)}>
							Later
						</Button>
					</div>
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-lg opacity-90">
				<PriorityMeter priority={task.priority} />
				<span class="tabular"
					>{formatClock(task.startTime)} - {formatClock(task.startTime + task.duration)}</span
				>
			</div>

			<h1 class="text-display line-clamp-3 font-bold break-words">{task.title}</h1>

			{#if task.description}
				<p class="line-clamp-4 max-w-3xl text-xl leading-relaxed opacity-90 md:text-2xl">
					{task.description}
				</p>
			{/if}

			<div>
				<div class="tabular text-clock font-bold">{formatCountdown(Math.max(0, left))}</div>
				<div class="mt-1 text-lg opacity-90">left</div>
			</div>

			<div
				class="h-3 max-w-xl overflow-hidden rounded-full bg-current/20"
				role="progressbar"
				aria-valuenow={Math.round(progress)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Time used"
			>
				<div
					class="h-full rounded-full bg-current transition-[width] duration-1000"
					style="width: {progress}%"
				></div>
			</div>

			{#if headsUp}
				<p class="text-xl font-semibold">
					{headsUpLine(headsUp, now, hero.kind === 'wrapping-up')}
				</p>
			{/if}

			<div class="flex flex-wrap items-center gap-3">
				<Button size="lg" class={doneClass} onclick={() => onDone(task)}>
					<Check />
					Done
				</Button>
				{#if hero.kind === 'wrapping-up'}
					<Button
						size="lg"
						variant="ghost"
						class="h-16 px-8 text-xl hover:bg-current/10"
						onclick={() => onExtend(task)}
					>
						15 more min
					</Button>
				{/if}
				{#if !stuck}
					<Button
						size="lg"
						variant="outline"
						class={secondaryClass}
						onclick={() => (stuckFor = { id: task.id, reason: null })}
					>
						I'm stuck
					</Button>
				{/if}
			</div>

			{#if stuck}
				<div
					class="max-w-xl space-y-3 rounded-lg border border-current/30 p-4"
					role="group"
					aria-label="I'm stuck"
				>
					{#if stuck.reason}
						<p class="text-xl leading-relaxed">{stuck.reason.hint}</p>
						<Button
							variant="ghost"
							class="px-0 text-base hover:bg-transparent hover:underline"
							onclick={() => (stuckFor = null)}>Close</Button
						>
					{:else}
						<p class="text-lg">What is in the way?</p>
						<div class="flex flex-wrap gap-2">
							{#each STUCK_REASONS as option (option.id)}
								<Button
									variant="outline"
									class="h-11 border-current bg-transparent text-base hover:bg-current/10"
									onclick={() => choose(option)}>{option.label}</Button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if reason}
				<p class="text-base opacity-80">{reason}</p>
			{/if}

			<!-- The rail sits below the fold on phones, so hint at what is next -->
			{#if next}
				<p class="truncate text-base opacity-90 md:hidden">
					Next <span class="tabular font-semibold">{formatClock(next.startTime)}</span>
					{next.title}
				</p>
			{/if}
		</div>
	{:else if hero.kind === 'free'}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Free time</h1>
			<p class="text-xl opacity-90 md:text-2xl">Next: {hero.next.title}</p>
			<div>
				<div class="tabular text-clock font-bold">
					{formatCountdown(hero.next.startTime - now)}
				</div>
				<div class="mt-1 text-lg opacity-90">
					until it starts at {formatClock(hero.next.startTime)}
				</div>
			</div>
			{#if reason}
				<p class="text-base opacity-80">{reason}</p>
			{/if}
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Nothing left today</h1>
			{#if reason}
				<p class="text-base opacity-80">{reason}</p>
			{/if}
		</div>
	{/if}
</section>
