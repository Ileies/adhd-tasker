<script lang="ts">
	import { tick } from 'svelte';
	import { Check, TriangleAlert } from '@lucide/svelte';
	import { TaskStatus, type Task } from '#lib/types.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import {
		DAY_MINUTES,
		MIN_DURATION,
		SNAP,
		keyAdjust,
		layoutDay,
		moveTo,
		resizeTo,
		snap,
		visibleRange
	} from '#lib/plan.js';
	import { QUICK_DURATION } from '#lib/quickadd.js';
	import { priorityStyle } from '#lib/urgency.js';

	const HOUR_PX = 64;
	const MOVE_THRESHOLD_PX = 4;
	/** A 15 minute task is only 16px tall, keep the title readable. */
	const MIN_BLOCK_PX = 28;
	/** Height of the thin row that holds the hours outside the day. */
	const ROW_PX = 32;

	let {
		date,
		tasks,
		now,
		showNow,
		highlight = null,
		onEdit,
		onAdd,
		onMove,
		onResize,
		onToggle
	}: {
		date: string;
		tasks: Task[];
		/** Minutes since midnight, drawn as a line when `showNow` is set. */
		now: number;
		showNow: boolean;
		/** A task that was just added: scrolled into view and outlined. */
		highlight?: number | null;
		onEdit: (task: Task) => void;
		/** A block drawn on empty space, titled in place. */
		onAdd: (title: string, startTime: number, duration: number) => void;
		onMove: (task: Task, startTime: number) => void;
		onResize: (task: Task, duration: number) => void;
		onToggle: (task: Task) => void;
	} = $props();

	interface Drag {
		id: number;
		mode: 'move' | 'resize';
		originY: number;
		originStart: number;
		originDuration: number;
		startTime: number;
		duration: number;
		moved: boolean;
	}

	/** A block being drawn on empty space, or waiting for its title. */
	interface Draft {
		startTime: number;
		duration: number;
		title: string;
		/** Still being dragged out, the title field comes after. */
		drawing: boolean;
		originY: number;
		originMinutes: number;
		moved: boolean;
	}

	let drag = $state<Drag | null>(null);
	let draft = $state<Draft | null>(null);
	let scroller: HTMLDivElement | undefined = $state();
	let grid: HTMLDivElement | undefined = $state();
	let earlyOpen = $state(false);
	let lateOpen = $state(false);

	const placements = $derived(layoutDay(tasks));
	// Hours outside the day fold into one thin row, unless a task is in them or the row was opened
	const range = $derived(visibleRange(tasks));
	const earlyFolded = $derived(range.start > 0 && !earlyOpen);
	const lateFolded = $derived(range.end < DAY_MINUTES && !lateOpen);
	const from = $derived(earlyFolded ? range.start : 0);
	const to = $derived(lateFolded ? range.end : DAY_MINUTES);
	const hours = $derived(
		Array.from(
			{ length: Math.floor(to / 60) - Math.ceil(from / 60) + 1 },
			(_, i) => Math.ceil(from / 60) + i
		)
	);
	const px = (minutes: number) => ((minutes - from) / 60) * HOUR_PX;

	/** The minute under a pointer, on the grid column. */
	function minutesAt(clientY: number) {
		const rect = grid!.getBoundingClientRect();
		return from + ((clientY - rect.top) / HOUR_PX) * 60;
	}

	function begin(event: PointerEvent, task: Task, mode: Drag['mode']) {
		if (event.button !== 0) return;
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			id: task.id,
			mode,
			originY: event.clientY,
			originStart: task.startTime,
			originDuration: task.duration,
			startTime: task.startTime,
			duration: task.duration,
			moved: false
		};
	}

	function track(event: PointerEvent) {
		if (!drag) return;
		const dy = event.clientY - drag.originY;
		const delta = (dy / HOUR_PX) * 60;
		if (drag.mode === 'move')
			drag.startTime = moveTo(drag.originStart + delta, drag.originDuration);
		else drag.duration = resizeTo(drag.originStart, drag.originDuration + delta);
		if (Math.abs(dy) > MOVE_THRESHOLD_PX) drag.moved = true;
	}

	function finish(event: PointerEvent, task: Task) {
		const current = drag;
		drag = null;
		if (!current) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		if (!current.moved) {
			if (current.mode === 'move') onEdit(task);
			return;
		}
		if (current.mode === 'move' && current.startTime !== task.startTime)
			onMove(task, current.startTime);
		if (current.mode === 'resize' && current.duration !== task.duration)
			onResize(task, current.duration);
	}

	// Empty space: a click makes a 30 minute block, a drag one of the dragged length
	function drawBegin(event: PointerEvent) {
		if (event.button !== 0 || event.target !== event.currentTarget) return;
		// A title that is typed but not entered yet is kept
		if (draft && !draft.drawing) commitDraft();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const minutes = minutesAt(event.clientY);
		const startTime = Math.max(
			0,
			Math.min(DAY_MINUTES - MIN_DURATION, Math.floor(minutes / SNAP) * SNAP)
		);
		draft = {
			startTime,
			duration: MIN_DURATION,
			title: '',
			drawing: true,
			originY: event.clientY,
			originMinutes: startTime,
			moved: false
		};
	}

	function drawTrack(event: PointerEvent) {
		if (!draft?.drawing) return;
		if (Math.abs(event.clientY - draft.originY) > MOVE_THRESHOLD_PX) draft.moved = true;
		const minutes = Math.max(0, Math.min(DAY_MINUTES, snap(minutesAt(event.clientY))));
		const start = Math.min(draft.originMinutes, minutes);
		const end = Math.max(draft.originMinutes + MIN_DURATION, minutes);
		draft.startTime = start;
		draft.duration = Math.min(DAY_MINUTES - start, end - start);
	}

	function drawEnd(event: PointerEvent) {
		if (!draft?.drawing) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		if (!draft.moved) {
			draft.duration = Math.min(QUICK_DURATION, DAY_MINUTES - draft.startTime);
		}
		draft.drawing = false;
	}

	function commitDraft() {
		const current = draft;
		// The field loses focus when a new block is started: that block is not finished
		if (current?.drawing) return;
		draft = null;
		const title = current?.title.trim();
		if (current && title) onAdd(title, current.startTime, current.duration);
	}

	/** Focuses the title field of a new block as soon as it exists. */
	function focusOnMount(element: HTMLInputElement) {
		element.focus();
	}

	function blockKey(event: KeyboardEvent, task: Task) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onEdit(task);
			return;
		}
		const change = keyAdjust(task, event.key, event.shiftKey);
		if (!change) return;
		event.preventDefault();
		event.stopPropagation();
		if ('startTime' in change && change.startTime !== task.startTime)
			onMove(task, change.startTime);
		if ('duration' in change && change.duration !== task.duration) onResize(task, change.duration);
	}

	// Start the view near the action: the current time, else the first task, else the morning
	let positionedFor = '';
	$effect(() => {
		if (!scroller || positionedFor === date) return;
		positionedFor = date;
		const focus = showNow ? now : Math.min(480, ...tasks.map((t) => t.startTime));
		const top = earlyFolded ? ROW_PX : 0;
		scroller.scrollTop = Math.max(0, top + px(Math.max(from, focus)) - HOUR_PX * 1.5);
	});

	// A new block comes into view
	$effect(() => {
		const id = highlight;
		if (id === null) return;
		void tick().then(() =>
			scroller?.querySelector(`[data-task="${id}"]`)?.scrollIntoView({ block: 'nearest' })
		);
	});
</script>

{#snippet fold(label: string, onclick: () => void)}
	<button
		type="button"
		class="text-muted-foreground hover:bg-muted/60 focus-visible:ring-ring tabular flex w-full cursor-pointer items-center border-y border-dashed px-4 text-xs focus-visible:ring-2 focus-visible:outline-none"
		style="height: {ROW_PX}px"
		{onclick}
	>
		{label}
	</button>
{/snippet}

<div bind:this={scroller} class="h-full overflow-y-auto">
	{#if earlyFolded}
		{@render fold(`${formatClock(0)} - ${formatClock(range.start)}`, () => (earlyOpen = true))}
	{/if}

	<div class="grid grid-cols-[3.5rem_1fr]" style="height: {px(to)}px">
		<div class="relative border-r">
			{#each hours as hour (hour)}
				<span
					class="tabular text-muted-foreground absolute right-2 -translate-y-1/2 text-xs {hour *
						60 ===
					from
						? 'hidden'
						: ''}"
					style="top: {px(hour * 60)}px"
				>
					{formatClock(hour * 60)}
				</span>
			{/each}
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={grid}
			class="relative cursor-copy touch-pan-y"
			onpointerdown={drawBegin}
			onpointermove={drawTrack}
			onpointerup={drawEnd}
			onpointercancel={() => (draft = null)}
			aria-label="Empty time, click or drag to add a task"
		>
			{#each hours as hour (hour)}
				<div
					class="border-border/60 pointer-events-none absolute inset-x-0 border-t"
					style="top: {px(hour * 60)}px"
				></div>
				<div
					class="border-border/30 pointer-events-none absolute inset-x-0 border-t border-dashed"
					style="top: {px(hour * 60 + 30)}px"
				></div>
			{/each}

			{#each placements as { task, lane, lanes, overlaps } (task.id)}
				{@const dragging = drag?.id === task.id ? drag : null}
				{@const start = dragging?.startTime ?? task.startTime}
				{@const duration = dragging?.duration ?? task.duration}
				{@const done = task.status === TaskStatus.Completed}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-task={task.id}
					role="button"
					tabindex="0"
					aria-label="{task.title}, {formatClock(start)} to {formatClock(start + duration)}"
					class="group focus-visible:ring-ring absolute touch-none overflow-hidden rounded-lg border-l-4 px-2 py-1 shadow-sm select-none focus-visible:ring-2 focus-visible:outline-none
						{priorityStyle[task.priority].block}
						{done ? 'opacity-55' : ''}
						{overlaps ? 'ring-warning ring-2' : ''}
						{highlight === task.id ? 'ring-foreground ring-2' : ''}
						{dragging ? 'z-10 cursor-grabbing shadow-lg' : 'cursor-grab'}"
					style="top: {px(start)}px; height: {Math.max(
						px(from + duration),
						MIN_BLOCK_PX
					)}px; left: calc({(lane / lanes) * 100}% + 2px); width: calc({100 / lanes}% - 4px)"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => blockKey(e, task)}
					onpointerdown={(e) => begin(e, task, 'move')}
					onpointermove={track}
					onpointerup={(e) => finish(e, task)}
					onpointercancel={() => (drag = null)}
				>
					<div class="flex items-start gap-1">
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium {done ? 'line-through' : ''}">
								{task.title}
							</div>
							{#if px(from + duration) >= 44}
								<div class="tabular truncate text-xs opacity-80">
									{formatClock(start)} - {formatClock(start + duration)} · {formatDuration(
										duration
									)}
								</div>
							{/if}
						</div>
						{#if overlaps}
							<TriangleAlert class="mt-0.5 size-4 shrink-0" aria-label="Overlaps another task" />
						{/if}
						<!-- The circle is 24px, the button around it is 40px wide so it is easy to hit -->
						<button
							type="button"
							class="-m-2 grid size-10 shrink-0 cursor-pointer place-items-center"
							aria-label={done ? 'Mark as not done' : 'Mark as done'}
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								onToggle(task);
							}}
						>
							<span
								class="grid size-6 place-items-center rounded-full border border-current/50 hover:bg-current/15 {done
									? 'bg-current/20'
									: ''}"
							>
								{#if done}<Check class="size-4" />{/if}
							</span>
						</button>
					</div>

					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize"
						onpointerdown={(e) => begin(e, task, 'resize')}
						onpointermove={track}
						onpointerup={(e) => finish(e, task)}
					>
						<div class="mx-auto mt-1 h-0.5 w-8 rounded-full bg-current/40"></div>
					</div>
				</div>
			{/each}

			{#if draft}
				<div
					class="border-primary bg-primary/15 pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-lg border-2 border-dashed px-2 py-1"
					style="top: {px(draft.startTime)}px; height: {Math.max(
						px(from + draft.duration),
						MIN_BLOCK_PX
					)}px"
				>
					{#if !draft.drawing}
						<input
							use:focusOnMount
							bind:value={draft.title}
							class="pointer-events-auto w-full bg-transparent text-sm font-medium outline-none"
							placeholder="Title, Enter to add"
							aria-label="Title of the new task"
							onkeydown={(e) => {
								if (e.key === 'Enter') commitDraft();
								else if (e.key === 'Escape') {
									e.stopPropagation();
									draft = null;
								}
							}}
							onblur={commitDraft}
						/>
					{/if}
					<div class="tabular text-muted-foreground text-xs">
						{formatClock(draft.startTime)} - {formatClock(draft.startTime + draft.duration)}
					</div>
				</div>
			{/if}

			<!-- What is past on today is dimmed, so what is left of the day shows at a glance -->
			{#if showNow && now > from}
				<div
					class="bg-background/50 pointer-events-none absolute inset-x-0 top-0 z-5"
					style="height: {px(Math.min(now, to))}px"
				></div>
			{/if}

			{#if showNow}
				<div
					class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
					style="top: {px(now)}px"
				>
					<div class="bg-destructive -ml-1 size-2 rounded-full"></div>
					<div class="bg-destructive h-0.5 flex-1"></div>
				</div>
			{/if}
		</div>
	</div>

	{#if lateFolded}
		{@render fold(
			`${formatClock(range.end)} - ${formatClock(DAY_MINUTES - 1)}`,
			() => (lateOpen = true)
		)}
	{/if}
</div>
