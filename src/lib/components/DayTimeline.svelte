<script lang="ts">
	import { Check, TriangleAlert } from '@lucide/svelte';
	import { TaskStatus, type Task } from '#lib/types.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { DAY_MINUTES, layoutDay, moveTo, resizeTo } from '#lib/plan.js';
	import { priorityStyle } from '#lib/urgency.js';

	const HOUR_PX = 64;
	const MOVE_THRESHOLD_PX = 4;
	/** A 15 minute task is only 16px tall, keep the title readable. */
	const MIN_BLOCK_PX = 28;
	const GRID_MINUTES = 15;

	let {
		date,
		tasks,
		now,
		showNow,
		onEdit,
		onCreate,
		onMove,
		onResize,
		onToggle
	}: {
		date: string;
		tasks: Task[];
		/** Minutes since midnight, drawn as a line when `showNow` is set. */
		now: number;
		showNow: boolean;
		onEdit: (task: Task) => void;
		onCreate: (startTime: number) => void;
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

	let drag = $state<Drag | null>(null);
	let scroller: HTMLDivElement | undefined = $state();

	const placements = $derived(layoutDay(tasks));
	const px = (minutes: number) => (minutes / 60) * HOUR_PX;

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

	function createAt(event: MouseEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const minutes = ((event.clientY - rect.top) / HOUR_PX) * 60;
		onCreate(Math.min(DAY_MINUTES - 60, Math.floor(minutes / GRID_MINUTES) * GRID_MINUTES));
	}

	// Start the view near the action: the current time, else the first task, else the morning
	let positionedFor = '';
	$effect(() => {
		if (!scroller || positionedFor === date) return;
		positionedFor = date;
		const focus = showNow
			? now
			: (tasks.reduce((min, t) => Math.min(min, t.startTime), 480) ?? 480);
		scroller.scrollTop = Math.max(0, px(focus) - HOUR_PX * 1.5);
	});
</script>

<div bind:this={scroller} class="h-full overflow-y-auto">
	<div class="grid grid-cols-[3.5rem_1fr]" style="height: {px(DAY_MINUTES)}px">
		<div class="relative border-r">
			{#each { length: 24 } as _, hour (hour)}
				<span
					class="tabular text-muted-foreground absolute right-2 -translate-y-1/2 text-xs {hour === 0
						? 'hidden'
						: ''}"
					style="top: {px(hour * 60)}px"
				>
					{formatClock(hour * 60)}
				</span>
			{/each}
		</div>

		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="relative cursor-copy"
			onclick={createAt}
			aria-label="Empty time, click to add a task"
		>
			{#each { length: 24 } as _, hour (hour)}
				<div
					class="border-border/60 absolute inset-x-0 border-t"
					style="top: {px(hour * 60)}px"
				></div>
				<div
					class="border-border/30 absolute inset-x-0 border-t border-dashed"
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
					class="group absolute touch-none overflow-hidden rounded-lg border-l-4 px-2 py-1 shadow-sm select-none
						{priorityStyle[task.priority].block}
						{done ? 'opacity-55' : ''}
						{overlaps ? 'ring-warning ring-2' : ''}
						{dragging ? 'z-10 cursor-grabbing shadow-lg' : 'cursor-grab'}"
					style="top: {px(start)}px; height: {Math.max(
						px(duration),
						MIN_BLOCK_PX
					)}px; left: calc({(lane / lanes) * 100}% + 2px); width: calc({100 / lanes}% - 4px)"
					onclick={(e) => e.stopPropagation()}
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
							{#if px(duration) >= 44}
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
						<button
							type="button"
							class="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border border-current/50 hover:bg-current/15
								{done ? 'bg-current/20' : ''}"
							aria-label={done ? 'Mark as not done' : 'Mark as done'}
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								onToggle(task);
							}}
						>
							{#if done}<Check class="size-4" />{/if}
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
</div>
