<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { STUCK_REASONS, type StuckAction, type StuckReason } from '#lib/anchoring.js';
	import { sessionSpent, type CheckData } from '#lib/checks.js';
	import type { Todo } from '#lib/core/repo.js';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import PriorityMeter from '#lib/components/PriorityMeter.svelte';
	import HeroCheck from '#lib/components/HeroCheck.svelte';
	import HeroFace from '#lib/components/HeroFace.svelte';
	import { activityById } from '#lib/breaks.js';
	import type { FaceAnswer } from '#lib/struggle.js';
	import HeroMenu from '#lib/components/HeroMenu.svelte';
	import TodoMenu from '#lib/components/TodoMenu.svelte';
	import SilenceLine from '#lib/components/SilenceLine.svelte';
	import { fade } from 'svelte/transition';
	import { formatClock, formatLeft, formatMinutes } from '#lib/format.js';
	import { endedAgo, headsUpLine, type HeroState } from '#lib/now.js';
	import { endsOnItsOwn, minutesLeft } from '#lib/priority.js';
	import { leaveLine } from '#lib/prep.js';
	import { tasker } from '#lib/app.svelte.js';
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
		todoCount = 0,
		firstUp = null,
		onQuickAdd,
		focusQuickAdd = false,
		onAsk,
		onStart,
		onResume,
		onRest,
		onTodoDone,
		onTodoEdit,
		onTodoDrop,
		onCheck,
		onBack,
		onSomethingElse,
		onTodoStuck,
		onBreak,
		onCheckBreak,
		onBreakBack,
		onBreakMore,
		onBreakStop,
		onStay,
		onFace,
		nowMs = Date.now(),
		calling = false,
		noteCount = 0,
		dark = false
	}: {
		hero: HeroState<Task, Todo>;
		now: number;
		reason: string | null;
		headsUp: Task | null;
		/** Title of the item that was just finished, shown for a moment before the hero moves on. */
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
		/** How many to-dos are open. With none, the morning and the plan state ask for the first one. */
		todoCount?: number;
		/** The next thing at a time today, said in the morning. */
		firstUp?: Task | null;
		/** Adds what the line of the plan state says. */
		onQuickAdd?: (text: string) => void;
		/** Puts the cursor in the plan line, when the visitor just said they want to plan. */
		focusQuickAdd?: boolean;
		/** Opens the assistant, only given when it can answer (a key is saved). */
		onAsk?: () => void;
		/** "Start" in the morning. */
		onStart?: () => void;
		/** Takes back "Call it a day". */
		onResume?: () => void;
		/** "Call it a day". */
		onRest?: () => void;
		onTodoDone?: (todo: Todo) => void;
		onTodoEdit?: (todo: Todo) => void;
		onTodoDrop?: (todo: Todo) => void;
		/** The answer to "How far is it?", also after "I was working on it". */
		onCheck?: (todo: Todo, data: CheckData) => void;
		/** "I'm back" after away, "I'm here" when asked in the plan state. */
		onBack?: () => void;
		/** "Something else": the to-do is pushed away, the ladder decides what comes next. */
		onSomethingElse?: (todo: Todo) => void;
		/** A stuck reason that matters to the ladder on a to-do: "I cannot get started", "I lost energy", "I need a break". */
		onTodoStuck?: (todo: Todo, reason: StuckReason) => void;
		/** "Take a break" in the menu. */
		onBreak?: () => void;
		/** The 5 minute break chip of a check: the answer counts as Keep going, then the break starts. */
		onCheckBreak?: (todo: Todo, data: CheckData) => void;
		/** "I'm back" and "Let's go". */
		onBreakBack?: () => void;
		/** "5 more min". */
		onBreakMore?: () => void;
		/** "Keep working instead": takes the break back. */
		onBreakStop?: (rowId: number) => void;
		/** "Stay on it" while a switch waits its 5 minutes. */
		onStay?: (rowId: number) => void;
		/** The answer to the question after a Face it session. */
		onFace?: (todo: Todo, answer: FaceAnswer, detail: { step?: string; days?: number }) => void;
		/** The time in epoch ms, for the countdown of a held switch. */
		nowMs?: number;
		/** It is past the time to start and nobody did: the morning calls. */
		calling?: boolean;
		/** Open assistant cards, shown as one line that jumps to them on phones. */
		noteCount?: number;
		/** Black surface: it is night and nothing is planned for now. */
		dark?: boolean;
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
	const todo = $derived(hero.kind === 'todo' ? hero.todo : null);
	/** "Leave now. Exam Math at 12:00." while travel runs. */
	const leave = $derived(task ? leaveLine(task, tasker.tasks) : null);
	const next = $derived(
		hero.kind === 'todo' || hero.kind === 'wrapping-up' || hero.kind === 'time-up'
			? hero.next
			: null
	);
	// The morning with nothing to start, and the plan state, ask what is next
	const asking = $derived(
		hero.kind === 'plan' || (hero.kind === 'away' && hero.since === null && todoCount === 0)
	);
	// The check of a session on a to-do, and the question after "I was working on it"
	const check = $derived(hero.kind === 'todo' ? hero.check : null);
	let reporting = $state(false);
	$effect(() => {
		if (hero.kind !== 'away') reporting = false;
	});

	// The stuck panel belongs to one item, it closes when another one becomes current
	let stuckFor = $state<{ key: string; reason: StuckReason | null; timer: boolean } | null>(null);
	const itemKey = $derived(task ? `task:${task.id}` : todo ? `todo:${todo.id}` : null);
	const stuck = $derived(itemKey && stuckFor?.key === itemKey ? stuckFor : null);

	function choose(reason: StuckReason) {
		if (!itemKey) return;
		// The reasons that act on their own need no hint: the ladder or a break takes over
		if (todo && 'effect' in reason) {
			stuckFor = null;
			onTodoStuck?.(todo, reason);
			return;
		}
		stuckFor = { key: itemKey, reason, timer: false };
		if (task) onStuck(task, reason);
		else if (todo && reason.id === 'cant-start') onTodoStuck?.(todo, reason);
	}

	// "Call it a day" says once what it costs, then asks
	let restAsk = $state(false);
	$effect(() => {
		if (hero.kind !== 'todo') restAsk = false;
	});
	function rest() {
		if (hero.kind === 'todo' && hero.cost) restAsk = true;
		else onRest?.();
	}
	const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - nowMs) / 1000));

	const left = $derived(task ? minutesLeft(task, now) : 0);
	// The bar drains like a Time Timer: it shows what is left
	const remaining = $derived(task ? Math.min(100, Math.max(0, (100 * left) / task.duration)) : 0);
	const sessionRemaining = $derived(
		hero.kind === 'todo' ? Math.min(100, Math.max(0, (100 * hero.left) / hero.length)) : 0
	);
	function surfaceOf(): string {
		if (done !== null) return urgencySurface[0];
		if (dark) return 'bg-black text-white';
		if (timeUp)
			return urgencySurface[
				urgencyLevel(timeUp.ended.priority, -timeUp.over, timeUp.ended.duration)
			];
		if (task) return urgencySurface[urgencyLevel(task.priority, left, task.duration)];
		if (todo && hero.kind === 'todo') {
			// Asked again, the hero crossfades to the attention color
			const level = urgencyLevel(todo.priority, hero.length, hero.length);
			return urgencySurface[Math.max(level, hero.check?.level === 1 ? 2 : 0) as 0 | 1 | 2 | 3];
		}
		// A break is calm, until the question after it is asked again
		if (hero.kind === 'break') return urgencySurface[hero.check?.level === 1 ? 2 : 0];
		// Plan what's next is asked in the attention color, the words say the same
		if (hero.kind === 'plan') return urgencySurface[2];
		if (hero.kind === 'away')
			return hero.since === null ? urgencySurface[calling ? 2 : 0] : 'bg-muted text-foreground';
		return urgencySurface[0];
	}
	const surface = $derived(surfaceOf());

	const doneClass =
		"bg-foreground text-background hover:bg-foreground/85 h-16 px-10 text-xl [&_svg:not([class*='size-'])]:size-6";
	const secondaryClass = 'h-16 border-current bg-transparent px-8 text-xl hover:bg-current/10';
	const barButtonClass = 'h-9 border-current bg-transparent px-4 text-base hover:bg-current/10';
</script>

{#snippet stuckButton()}
	{#if !stuck && itemKey}
		<Button
			size="lg"
			variant="outline"
			class="h-14 border-current bg-transparent px-6 text-lg hover:bg-current/10"
			onclick={() => (stuckFor = { key: itemKey, reason: null, timer: false })}
		>
			I'm stuck
		</Button>
	{/if}
{/snippet}

{#snippet stuckPanel()}
	{#if stuck}
		<div
			class="max-w-xl space-y-3 rounded-lg border border-current/30 p-4"
			role="group"
			aria-label="I'm stuck"
		>
			{#if stuck.reason}
				<p class="text-xl leading-relaxed">{stuck.reason.hint}</p>
				{#if 'action' in stuck.reason}
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
				{/if}
				<Button
					variant="ghost"
					class="px-0 text-base hover:bg-transparent hover:underline"
					onclick={() => (stuckFor = null)}>Close</Button
				>
			{:else}
				<p class="text-lg">What is in the way?</p>
				<div class="flex flex-wrap gap-2">
					<!-- A task at a time has no to-do to rotate away from, and a break is not its business -->
					{#each STUCK_REASONS.filter((option) => todo || !('effect' in option)) as option (option.id)}
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
{/snippet}

{#snippet reasonLine()}
	{#if reason}
		<p class="text-base opacity-80" transition:fade={{ duration: 1000 }}>{reason}</p>
	{/if}
{/snippet}

{#snippet nextLine()}
	<!-- The rail sits below the fold on phones, so hint at what is next -->
	{#if next}
		<p class="truncate text-base opacity-90 md:hidden">
			Next <span class="tabular font-semibold">{formatClock(next.startTime)}</span>
			{next.title}
		</p>
	{/if}
{/snippet}

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

			{#if leave}
				<p class="text-2xl font-semibold md:text-3xl">{leave}</p>
			{/if}

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
				<!-- An appointment ends on its own: nothing to extend, and nothing to be stuck on -->
				{#if hero.kind === 'wrapping-up' && !endsOnItsOwn(task)}
					<Button
						size="lg"
						variant="ghost"
						class="h-16 px-8 text-xl hover:bg-current/10"
						onclick={() => onExtend(task)}
					>
						15 more min
					</Button>
				{/if}
				{#if !endsOnItsOwn(task)}{@render stuckButton()}{/if}
				<HeroMenu {task} {onEdit} {onExtend} {onLater} {onTomorrow} {onDrop} />
			</div>

			{@render stuckPanel()}
			{@render reasonLine()}
			{@render nextLine()}

			<!-- A question in the rail is never seen on a phone, so the hero points at it -->
			{#if note && !compact}
				<a href="#assistant-note" class="text-base underline md:hidden">{note}</a>
			{/if}
		</div>
	{:else if hero.kind === 'todo'}
		{@const item = hero.todo}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-lg opacity-90">
				<PriorityMeter priority={item.priority} showLabel={false} />
			</div>

			{#if check}
				<p class="text-2xl font-semibold">
					{check.level === 1 ? 'Still there? ' : ''}{check.early && next
						? `${next.title} at ${formatClock(next.startTime)}. `
						: ''}{check.about === 'face'
						? 'You gave it its ten minutes. What now?'
						: 'How far is it?'}
				</p>
			{:else if hero.face && hero.line}
				<!-- Face it is named for the whole session, not for a minute -->
				<p class="max-w-3xl text-2xl font-semibold">{hero.line}</p>
			{/if}

			<h1 class="text-display line-clamp-3 font-bold break-words">{item.title}</h1>

			{#if item.nextStep && !check}
				<p class="max-w-3xl text-xl leading-relaxed md:text-2xl">
					<span class="opacity-80">Next step:</span>
					{item.nextStep}
				</p>
			{/if}

			{#if check}
				<!-- The question owns the hero, the progress takes the place of the time -->
				<div>
					<div class="tabular text-clock font-bold">{item.progress} %</div>
					{#if item.estimate !== null}
						<div class="mt-1 text-lg opacity-90">
							{formatMinutes(item.spentMinutes)} of about {formatMinutes(item.estimate)}
						</div>
					{/if}
				</div>
				{#if check.about === 'face'}
					<HeroFace onAnswer={(answer, detail) => onFace?.(item, answer, detail)} />
				{:else}
					<HeroCheck
						todo={item}
						sessionLength={check.sessionLength}
						keeps={check.keeps}
						sizeAsked={check.sizeAsked}
						offerBreak={check.offerBreak}
						minutes={() => sessionSpent(check.sessionStart, Date.now(), check.sessionLength)}
						onAnswer={(data) => onCheck?.(item, data)}
						onBreak={(data) => onCheckBreak?.(item, data)}
					/>
				{/if}
			{:else}
				<div>
					<div class="tabular text-clock font-bold">{formatMinutes(hero.left)}</div>
					<div class="mt-1 text-lg opacity-90">left in this session</div>
				</div>

				<div
					class="h-4 w-full overflow-hidden rounded-full bg-current/20"
					role="progressbar"
					aria-valuenow={Math.round(sessionRemaining)}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuetext={formatLeft(hero.left)}
					aria-label="Time left in this session"
				>
					<div
						class="h-full rounded-full bg-current transition-[width] duration-1000"
						style="width: {sessionRemaining}%"
					></div>
				</div>
			{/if}

			<!-- How far the whole to-do is, a quiet line, never a score -->
			<div
				class="h-2 w-full max-w-md overflow-hidden rounded-full bg-current/20"
				role="progressbar"
				aria-valuenow={item.progress}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Progress on this to-do"
			>
				<div class="h-full rounded-full bg-current/70" style="width: {item.progress}%"></div>
			</div>

			{#if hero.held}
				{@const held = hero.held}
				<!-- Losing steam in the first minutes is often the wall in front of starting: try, then switch -->
				<div
					class="flex max-w-xl flex-col gap-3 rounded-lg border border-current/30 p-4"
					role="status"
				>
					<p class="text-xl leading-relaxed">
						Give it 5 minutes first. If it still does not work, I'll switch.
					</p>
					<p class="tabular text-lg opacity-90">
						Switching in {formatMinutes(Math.ceil(secondsLeft(held.until) / 60))}
					</p>
					<div>
						<Button
							variant="outline"
							class="h-11 border-current bg-transparent text-base hover:bg-current/10"
							onclick={() => onStay?.(held.rowId)}
						>
							Stay on it
						</Button>
					</div>
				</div>
			{/if}

			{#if headsUp}
				<p class="text-xl font-semibold">{headsUpLine(headsUp, now, false)}</p>
			{/if}

			{#if restAsk && hero.cost}
				<div
					class="flex max-w-xl flex-col gap-3 rounded-lg border border-current/30 p-4"
					role="group"
					aria-label="Call it a day"
				>
					<p class="text-xl leading-relaxed">{hero.cost}</p>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="outline"
							class="h-11 border-current bg-transparent text-base hover:bg-current/10"
							onclick={() => {
								restAsk = false;
								onRest?.();
							}}
						>
							Call it a day
						</Button>
						<Button
							class="bg-foreground text-background hover:bg-foreground/85 h-11 text-base"
							onclick={() => (restAsk = false)}
						>
							One more session
						</Button>
					</div>
				</div>
			{/if}

			<div
				class="flex flex-wrap items-center gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-6 max-md:bg-inherit max-md:px-6 max-md:py-3"
			>
				<Button size="lg" class={doneClass} onclick={() => onTodoDone?.(item)}>
					<Check />
					Done
				</Button>
				<!-- A faced to-do cannot be switched away from, the question at its end is the way out -->
				{#if !check && !hero.face && !hero.held}
					<Button
						size="lg"
						variant="outline"
						class="h-14 border-current bg-transparent px-6 text-lg hover:bg-current/10"
						onclick={() => onSomethingElse?.(item)}
					>
						Something else
					</Button>
				{/if}
				{@render stuckButton()}
				<TodoMenu
					todo={item}
					onEdit={(value) => onTodoEdit?.(value)}
					onBreak={() => onBreak?.()}
					onRest={rest}
					onDrop={(value) => onTodoDrop?.(value)}
				/>
			</div>

			{@render stuckPanel()}
			{@render reasonLine()}
			{@render nextLine()}

			{#if note && !compact}
				<a href="#assistant-note" class="text-base underline md:hidden">{note}</a>
			{/if}
		</div>
	{:else if hero.kind === 'break'}
		{@const asked = hero.check}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			{#if !asked}
				<p class="text-lg font-semibold opacity-90">Break</p>
				<h1 class="max-w-4xl text-4xl leading-tight font-bold md:text-6xl">
					{activityById(hero.activity).text}
				</h1>
				<div>
					<div class="tabular text-clock font-bold">{formatMinutes(hero.left)}</div>
					<div class="mt-1 text-lg opacity-90">left. I'll call you back.</div>
				</div>
				<div
					class="h-4 w-full overflow-hidden rounded-full bg-current/20"
					role="progressbar"
					aria-valuenow={Math.round((100 * hero.left) / hero.minutes)}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Break time left"
				>
					<div
						class="h-full rounded-full bg-current transition-[width] duration-1000"
						style="width: {Math.min(100, (100 * hero.left) / hero.minutes)}%"
					></div>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Button size="lg" class={doneClass} onclick={() => onBreakBack?.()}>I'm back</Button>
					<Button
						variant="ghost"
						class="h-16 px-6 text-xl hover:bg-current/10"
						onclick={() => onBreakStop?.(hero.rowId)}
					>
						Keep working instead
					</Button>
				</div>
			{:else if asked.about === 'day'}
				<h1 class="text-display font-bold">
					{asked.level === 1 ? 'Still there? ' : ''}Done with focus work for today?
				</h1>
				<div class="flex flex-wrap items-center gap-3">
					<Button size="lg" class={doneClass} onclick={() => onBreakBack?.()}>Keep going</Button>
					<Button size="lg" variant="outline" class={secondaryClass} onclick={() => onRest?.()}>
						Call it a day
					</Button>
				</div>
			{:else}
				<p class="text-lg font-semibold opacity-90">
					{asked.level === 1 ? 'Still there? Break is over.' : 'Break is over.'}
				</p>
				<h1 class="text-display line-clamp-3 font-bold break-words">
					{hero.todo ? `Back to ${hero.todo.title}?` : 'Back to work?'}
				</h1>
				<div class="flex flex-wrap items-center gap-3">
					<Button size="lg" class={doneClass} onclick={() => onBreakBack?.()}>Let's go</Button>
					<Button
						size="lg"
						variant="outline"
						class={secondaryClass}
						onclick={() => onBreakMore?.()}
					>
						5 more min
					</Button>
				</div>
			{/if}
			{@render reasonLine()}
		</div>
	{:else if hero.kind === 'ready'}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Get ready</h1>
			<p class="text-xl opacity-90 md:text-2xl">{hero.next.title}</p>
			<div>
				<div class="tabular text-clock font-bold">{formatMinutes(hero.left)}</div>
				<div class="mt-1 text-lg opacity-90">
					until it starts at {formatClock(hero.next.startTime)}
				</div>
			</div>
			{@render reasonLine()}
		</div>
	{:else if dark}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Sleep</h1>
			{#if firstUp}
				<p class="text-xl opacity-90 md:text-2xl">
					Next: <span class="tabular font-semibold">{formatClock(firstUp.startTime)}</span>
					{firstUp.title}
				</p>
			{/if}
		</div>
	{:else if hero.kind === 'plan' && hero.check}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">Still there?</h1>
			<p class="text-xl opacity-90 md:text-2xl">Nothing is open right now.</p>
			<div>
				<Button size="lg" class={doneClass} onclick={() => onBack?.()}>I'm here</Button>
			</div>
		</div>
	{:else if asking && onQuickAdd}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">
				{hero.kind === 'away' ? 'Good morning' : "Plan what's next"}
			</h1>
			<form class="flex max-w-xl gap-2" onsubmit={addQuick}>
				<Input
					bind:ref={quickInput}
					bind:value={quick}
					placeholder="What is the first thing?"
					aria-label="Add a to-do"
					class="h-14 border-current bg-transparent px-4 text-lg placeholder:text-current/60"
				/>
				<Button
					type="submit"
					size="lg"
					class="{doneClass} h-14 px-6 text-lg"
					disabled={!quick.trim()}>Add</Button
				>
			</form>
			<div class="flex flex-wrap gap-x-6">
				<Button
					variant="ghost"
					class="px-0 text-lg hover:bg-transparent hover:underline"
					href="/edit"
				>
					Open Plan
				</Button>
				{#if onAsk}
					<Button
						variant="ghost"
						class="px-0 text-lg hover:bg-transparent hover:underline"
						onclick={onAsk}
					>
						Ask the assistant
					</Button>
				{/if}
			</div>
			{@render reasonLine()}
		</div>
	{:else if hero.kind === 'away' && hero.since !== null}
		{@const gone = hero.todo}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">Away since {formatClock(hero.since)}</h1>
			{#if gone && reporting}
				<p class="text-2xl font-semibold">How far is {gone.title}?</p>
				<HeroCheck
					todo={gone}
					sessionLength={hero.minutes}
					sizeAsked={true}
					worked
					minutes={() => (hero.kind === 'away' ? hero.minutes : 0)}
					onAnswer={(data) => onCheck?.(gone, data)}
				/>
			{:else}
				{#if gone}
					<p class="text-xl opacity-90 md:text-2xl">{gone.title} is waiting.</p>
				{/if}
				<div class="flex flex-wrap items-center gap-3">
					<Button size="lg" class={doneClass} onclick={() => onBack?.()}>I'm back</Button>
					{#if gone}
						<Button
							size="lg"
							variant="outline"
							class={secondaryClass}
							onclick={() => (reporting = true)}
						>
							I was working on it
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{:else if hero.kind === 'away'}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">{calling ? 'Time to start' : 'Good morning'}</h1>
			{#if firstUp}
				<p class="text-xl opacity-90 md:text-2xl">
					First: <span class="tabular font-semibold">{formatClock(firstUp.startTime)}</span>
					{firstUp.title}
				</p>
			{/if}
			<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
				<Button size="lg" class={doneClass} onclick={() => onStart?.()}>Start</Button>
				{#if calling}
					<Button
						variant="ghost"
						class="px-0 text-lg hover:bg-transparent hover:underline"
						onclick={() => onRest?.()}
					>
						Call it a day
					</Button>
				{/if}
			</div>
		</div>
	{:else if hero.kind === 'rest'}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<h1 class="text-display font-bold">Day is done</h1>
			<div>
				<Button size="lg" variant="outline" class={secondaryClass} onclick={() => onResume?.()}>
					Back to work
				</Button>
			</div>
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<h1 class="text-display font-bold">Plan what's next</h1>
			{@render reasonLine()}
		</div>
	{/if}

	<!-- On wide screens the line sits at the bottom of the rail instead -->
	{#if !compact}
		<div class="mx-auto mt-8 w-full max-w-5xl lg:hidden">
			<SilenceLine class="flex" />
		</div>
	{/if}
</section>
