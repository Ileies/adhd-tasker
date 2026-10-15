<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { STUCK_REASONS, type StuckAction, type StuckReason } from '#lib/anchoring.js';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import HeroMenu from '#lib/components/HeroMenu.svelte';
	import SilenceLine from '#lib/components/SilenceLine.svelte';
	import { fade } from 'svelte/transition';
	import { formatClock, formatLeft, formatMinutes } from '#lib/format.js';
	import { endedAgo, headsUpLine, type HeroState } from '#lib/now.js';
	import { minutesLeft } from '#lib/priority.js';
	import { noteLine } from '#lib/rail.js';
	import { urgencyLevel, urgencySurface } from '#lib/urgency.js';

	let {
		hero,
		now,
		reason,
		headsUp,
		done = null,
		onDone,
		onStuck,
		onExtend,
		onLater,
		onTomorrow,
		onEdit,
		onDrop,
		onTimer,
		concurrent,
		compact = false,
		planned = 1,
		onQuickAdd,
		focusQuickAdd = false,
		noteCount = 0
	}: {
		hero: HeroState<Task>;
		now: number;
		reason: string | null;
		headsUp: Task | null;
		/** Title of the task that was just finished, shown for a moment before the hero moves on. */
		done?: string | null;
		onDone: (task: Task) => void;
		onStuck: (task: Task, reason: StuckReason) => void;
		onExtend: (task: Task) => void;
		onLater: (task: Task) => void;
		onTomorrow: (task: Task) => void;
		onEdit: (task: Task) => void;
		onDrop: (task: Task) => void;
		onTimer: (action: StuckAction) => void;
		concurrent: number;
		/** A smaller hero without the page's height, for the example in the welcome. */
		compact?: boolean;
		/** How many tasks today has. With none, the empty state asks for the first one. */
		planned?: number;
		/** Adds what the empty state's line says. */
		onQuickAdd?: (text: string) => void;
		/** Puts the cursor in the empty state's line, when the visitor just said they want to plan. */
		focusQuickAdd?: boolean;
		/** Open assistant cards, shown as one line that jumps to them on phones. */
		noteCount?: number;
	} = $props();

	const note = $derived(noteLine(noteCount));

	let quick = $state('');
	let quickInput: HTMLInputElement | null = $state(null);
	$effect(() => {
		if (focusQuickAdd) quickInput?.focus();
	});

	function addQuick(event: Event) {
		event.preventDefault();
		const text = quick;
		quick = '';
		onQuickAdd?.(text);
	}

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
	let stuckFor = $state<{ id: number; reason: StuckReason | null; timer: boolean } | null>(null);
	const stuck = $derived(task && stuckFor?.id === task.id ? stuckFor : null);

	function choose(reason: StuckReason) {
		if (!task) return;
		stuckFor = { id: task.id, reason, timer: false };
		onStuck(task, reason);
	}

	const left = $derived(task ? minutesLeft(task, now) : 0);
	// The bar drains like a Time Timer: it shows what is left
	const remaining = $derived(task ? Math.min(100, Math.max(0, (100 * left) / task.duration)) : 0);
	const surface = $derived(
		done !== null
			? urgencySurface[0]
			: timeUp
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
	class="relative flex flex-col justify-center transition-colors duration-[1500ms] {compact
		? 'rounded-xl px-6 py-8 sm:px-10'
		: 'min-h-svh px-6 pt-20 pb-10 sm:px-12 md:min-h-[60svh] lg:min-h-full'} {surface}"
	aria-live={compact ? 'off' : 'polite'}
>
	{#if done !== null}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6" in:fade={{ duration: 400 }}>
			<div class="flex items-center gap-3 text-lg opacity-90">
				<Check class="size-7" aria-hidden="true" />
				<span class="font-semibold">Done</span>
			</div>
			<h1
				class="text-display line-clamp-3 font-bold break-words line-through decoration-2 opacity-80"
			>
				{done}
			</h1>
		</div>
	{:else if timeUp}
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
				<!-- The bars carry the priority without color, the urgency color says the rest -->
				<PriorityMeter priority={task.priority} showLabel={false} />
				<span class="tabular"
					>{formatClock(task.startTime)} - {formatClock(task.startTime + task.duration)}</span
				>
				{#if concurrent > 1}
					<span>Highest of {concurrent} right now</span>
				{/if}
			</div>

			<h1
				class="line-clamp-3 font-bold break-words {compact
					? 'text-3xl md:text-4xl'
					: 'text-display'}"
			>
				{task.title}
			</h1>

			{#if task.description}
				<p class="line-clamp-4 max-w-3xl text-xl leading-relaxed opacity-90 md:text-2xl">
					{task.description}
				</p>
			{/if}

			<div>
				<div class="tabular font-bold {compact ? 'text-5xl' : 'text-clock'}">
					{formatMinutes(left)}
				</div>
				<div class="mt-1 text-lg opacity-90">
					left, until {formatClock(task.startTime + task.duration)}
				</div>
			</div>

			<div
				class="h-4 w-full overflow-hidden rounded-full bg-current/20"
				role="progressbar"
				aria-valuenow={Math.round(remaining)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuetext={formatLeft(left, task.startTime + task.duration)}
				aria-label="Time left"
			>
				<div
					class="h-full rounded-full bg-current transition-[width] duration-1000"
					style="width: {remaining}%"
				></div>
			</div>

			{#if headsUp}
				<p class="text-xl font-semibold">
					{headsUpLine(headsUp, now, hero.kind === 'wrapping-up')}
				</p>
			{/if}

			<!-- The example in the welcome shows the time, not the buttons -->
			<!-- On phones the actions stay at the bottom edge, within the thumb's reach -->
			<div
				class="flex flex-wrap items-center gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-6 max-md:bg-inherit max-md:px-6 max-md:py-3 {compact
					? 'hidden'
					: ''}"
			>
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
						class="h-14 border-current bg-transparent px-6 text-lg hover:bg-current/10"
						onclick={() => (stuckFor = { id: task.id, reason: null, timer: false })}
					>
						I'm stuck
					</Button>
				{/if}
				<HeroMenu {task} {onEdit} {onExtend} {onLater} {onTomorrow} {onDrop} />
			</div>

			{#if stuck}
				<div
					class="max-w-xl space-y-3 rounded-lg border border-current/30 p-4"
					role="group"
					aria-label="I'm stuck"
				>
					{#if stuck.reason}
						<p class="text-xl leading-relaxed">{stuck.reason.hint}</p>
						{@const action = stuck.reason.action}
						<Button
							variant="outline"
							class="h-11 border-current bg-transparent text-base hover:bg-current/10"
							disabled={stuck.timer}
							onclick={() => {
								if (stuckFor) stuckFor.timer = true;
								onTimer(action);
							}}
						>
							{stuck.timer ? 'Timer set' : action.label}
						</Button>
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
				<p class="text-base opacity-80" transition:fade={{ duration: 1000 }}>{reason}</p>
			{/if}

			<!-- The rail sits below the fold on phones, so hint at what is next -->
			{#if next}
				<p class="truncate text-base opacity-90 md:hidden">
					Next <span class="tabular font-semibold">{formatClock(next.startTime)}</span>
					{next.title}
				</p>
			{/if}

			<!-- A question in the rail is never seen on a phone, so the hero points at it -->
			{#if note && !compact}
				<a href="#assistant-note" class="text-base underline md:hidden">{note}</a>
			{/if}
		</div>
	{:else if hero.kind === 'free'}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Free time</h1>
			<p class="text-xl opacity-90 md:text-2xl">Next: {hero.next.title}</p>
			<div>
				<div class="tabular text-clock font-bold">
					{formatMinutes(hero.next.startTime - now)}
				</div>
				<div class="mt-1 text-lg opacity-90">
					until it starts at {formatClock(hero.next.startTime)}
				</div>
			</div>
			{#if reason}
				<p class="text-base opacity-80" transition:fade={{ duration: 1000 }}>{reason}</p>
			{/if}
		</div>
	{:else if planned === 0 && onQuickAdd}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">Nothing planned today</h1>
			<form class="flex max-w-xl gap-2" onsubmit={addQuick}>
				<Input
					bind:ref={quickInput}
					bind:value={quick}
					placeholder="What is the first thing?"
					aria-label="Add a task for today"
					class="h-14 border-current bg-transparent px-4 text-lg placeholder:text-current/60"
				/>
				<Button
					type="submit"
					size="lg"
					class="{doneClass} h-14 px-6 text-lg"
					disabled={!quick.trim()}>Add</Button
				>
			</form>
			<div>
				<Button
					variant="ghost"
					class="px-0 text-lg hover:bg-transparent hover:underline"
					href="/edit"
				>
					Open Plan
				</Button>
			</div>
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Nothing left today</h1>
			{#if reason}
				<p class="text-base opacity-80" transition:fade={{ duration: 1000 }}>{reason}</p>
			{/if}
		</div>
	{/if}

	<!-- On wide screens the line sits at the bottom of the rail instead -->
	{#if !compact}
		<div class="mx-auto mt-8 w-full max-w-5xl lg:hidden">
			<SilenceLine class="flex" />
		</div>
	{/if}
</section>
