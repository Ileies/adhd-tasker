<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ChevronDown, ChevronUp, TriangleAlert, X } from '@lucide/svelte';
	import { tasker, type Alarm } from '#lib/app.svelte.js';
	import { alarmStatus, stackCards, type AlarmDayState, type DayAlarm } from '#lib/alarmview.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { TaskStatus, type Task } from '#lib/types.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import {
		DAY_MINUTES,
		MIN_DURATION,
		SNAP,
		keyAdjust,
		layoutDay,
		dayOffset,
		midnightOffset,
		moveOnTimeline,
		resizeTo,
		snap,
		timeAtOffset,
		timelineRange,
		MY_DAY
	} from '#lib/plan.js';
	import { QUICK_DURATION } from '#lib/quickadd.js';
	import { priorityStyle } from '#lib/urgency.js';

	const COMFY_HOUR_PX = 64;
	/** Compact never squeezes an hour below this, the day scrolls instead. */
	const COMPACT_MIN_HOUR_PX = 26;
	const MOVE_THRESHOLD_PX = 4;
	/** A 15 minute task is only 16px tall, keep the title readable. */
	const COMFY_MIN_BLOCK_PX = 28;
	const COMPACT_MIN_BLOCK_PX = 18;
	/** Space on every side of a block, so neighbours never touch. */
	const GAP_PX = 2;
	/** A block that can show its title and time on two lines, below this only the title. */
	const TWO_LINES_PX = 44;
	/** Height of the thin row that holds the hours outside the day. */
	const ROW_PX = 32;
	/** Height of one alarm card in the lane beside the grid. */
	const CARD_PX = 48;
	/** Strong when the alarm rings this day, dashed and soft on other days, grey when off. The card says it in words too. */
	const ALARM_LINE: Record<AlarmDayState, string> = {
		'on-day': 'border-primary',
		'other-day': 'border-primary/40 border-dashed',
		off: 'border-muted-foreground/40 border-dashed'
	};
	const ALARM_CARD: Record<AlarmDayState, string> = {
		'on-day': 'border-l-primary bg-primary/15',
		'other-day': 'border-l-primary/35 bg-background text-foreground/75',
		off: 'border-l-muted-foreground/30 bg-muted text-muted-foreground'
	};
	const CONNECTOR: Record<AlarmDayState, string> = {
		'on-day': 'stroke-primary',
		'other-day': 'stroke-primary/40',
		off: 'stroke-muted-foreground/40'
	};

	let {
		date,
		tasks,
		now,
		showNow,
		alarms = [],
		onAlarmSwitch,
		onAlarmCancel,
		onAlarmEdit,
		highlight = null,
		compact = false,
		day = MY_DAY,
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
		/** The alarms with how they relate to this day (`dayPanelAlarms`). With `onAlarmSwitch` they get a lane beside the grid. */
		alarms?: DayAlarm[];
		onAlarmSwitch?: (alarm: Alarm, enabled: boolean) => void;
		onAlarmCancel?: (alarm: Alarm) => void;
		onAlarmEdit?: (alarm: Alarm) => void;
		/** A task that was just added: scrolled into view and outlined. */
		highlight?: number | null;
		/** Fit the whole shown day on the screen when it can, otherwise the usual hour height. */
		compact?: boolean;
		/** My day: the hours shown in full, the rest folds. */
		day?: { start: number; end: number };
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
	let nightOpen = $state(false);

	// The timeline starts where the night starts (end of My day), so the night is one block at the
	// top. Positions on it are offsets from that start, see `dayOffset`.
	const origin = $derived(day.end);
	const midnight = $derived(midnightOffset(origin));
	const off = (time: number) => dayOffset(time, origin);
	// The night folds into one thin row, down to the hours that hold a task, until it is opened
	const range = $derived(timelineRange(tasks, day));
	const from = $derived(nightOpen ? 0 : range.from);
	const to = $derived(range.to);
	const hours = $derived(
		Array.from(
			{ length: Math.floor(to / 60) - Math.ceil(from / 60) + 1 },
			(_, i) => Math.ceil(from / 60) + i
		)
	);
	let viewHeight = $state(0);
	// Compact stretches the shown hours over the height of the view, but never past the comfortable size
	const hourPx = $derived.by(() => {
		if (!compact || viewHeight <= 0) return COMFY_HOUR_PX;
		const free = viewHeight - (range.night > 0 && !nightOpen ? ROW_PX : 0);
		const fit = Math.floor((free / (to - from)) * 60);
		return Math.max(COMPACT_MIN_HOUR_PX, Math.min(COMFY_HOUR_PX, fit));
	});
	const MIN_BLOCK_PX = $derived(compact ? COMPACT_MIN_BLOCK_PX : COMFY_MIN_BLOCK_PX);
	const px = (offset: number) => ((offset - from) / 60) * hourPx;
	/** Where a block is drawn: inside its time with a gap all round, but never shorter than `MIN_BLOCK_PX`. */
	const blockBox = (start: number, duration: number) => ({
		top: px(off(start)) + GAP_PX,
		height: Math.max(px(from + duration) - 2 * GAP_PX, MIN_BLOCK_PX)
	});
	// A short block is drawn taller than its time, the columns account for that so it never covers the next one
	const placements = $derived(
		layoutDay(tasks, { minLength: ((MIN_BLOCK_PX + 2 * GAP_PX) / hourPx) * 60, origin })
	);
	// An alarm in the folded night is hidden until the night is opened
	const cards = $derived.by(() => {
		const sorted = alarms
			.filter((row) => off(row.minutes) >= from)
			.map((row) => ({ row, y: px(Math.min(off(row.minutes), to)) }))
			.sort((a, b) => a.y - b.y || a.row.alarm.id - b.row.alarm.id);
		const tops = stackCards(
			sorted.map((card) => card.y),
			CARD_PX
		);
		return sorted.map((card, i) => ({ ...card, top: tops[i] }));
	});
	/** The lane may need more height than the hours when many alarms are close together. */
	const bodyPx = $derived(Math.max(px(to), ...cards.map((card) => card.top + CARD_PX + 4), 0));
	const dayName = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: tasker.timezone ?? undefined
		})
	);
	/** Where the day ends on this side of midnight: a block drawn there stays on its side. */
	const sideEnd = (offset: number) => (offset < midnight ? midnight : DAY_MINUTES);
	const sideStart = (offset: number) => (offset < midnight ? 0 : midnight);

	/** The offset under a pointer, on the grid column. */
	function minutesAt(clientY: number) {
		const rect = grid!.getBoundingClientRect();
		return from + ((clientY - rect.top) / hourPx) * 60;
	}

	/** Past stretches of today, as offset ranges, so what is left of the day shows at a glance. */
	const past = $derived.by(() => {
		if (!showNow) return [];
		const at = off(now);
		const spans =
			at >= midnight
				? [[midnight, at]]
				: [
						[0, at],
						[midnight, DAY_MINUTES]
					];
		return (
			spans
				// The night keeps one even tint, it is not dimmed
				.map(([a, b]) => ({ a: Math.max(a, from, range.night), b: Math.min(b, to) }))
				.filter(({ a, b }) => b > a)
		);
	});

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
		const delta = (dy / hourPx) * 60;
		if (drag.mode === 'move')
			drag.startTime = moveOnTimeline(drag.originStart, drag.originDuration, delta, origin);
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
		const raw = Math.max(0, Math.min(DAY_MINUTES - MIN_DURATION, minutesAt(event.clientY)));
		// A block stays on its side of midnight
		const offset = Math.min(Math.floor(raw / SNAP) * SNAP, sideEnd(raw) - MIN_DURATION);
		draft = {
			startTime: timeAtOffset(offset, origin),
			duration: MIN_DURATION,
			title: '',
			drawing: true,
			originY: event.clientY,
			// An offset, not a time of day
			originMinutes: offset,
			moved: false
		};
	}

	function drawTrack(event: PointerEvent) {
		if (!draft?.drawing) return;
		if (Math.abs(event.clientY - draft.originY) > MOVE_THRESHOLD_PX) draft.moved = true;
		const first = draft.originMinutes;
		const minutes = Math.max(
			sideStart(first),
			Math.min(sideEnd(first), snap(minutesAt(event.clientY)))
		);
		const start = Math.min(first, minutes);
		const end = Math.max(first + MIN_DURATION, minutes);
		draft.startTime = timeAtOffset(start, origin);
		draft.duration = Math.min(sideEnd(first) - start, end - start);
	}

	function drawEnd(event: PointerEvent) {
		if (!draft?.drawing) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		if (!draft.moved) {
			draft.duration = Math.min(
				QUICK_DURATION,
				sideEnd(draft.originMinutes) - off(draft.startTime)
			);
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
		const focus = showNow ? off(now) : Math.min(off(480), ...tasks.map((t) => off(t.startTime)));
		const top = range.night > 0 ? ROW_PX : 0;
		scroller.scrollTop = Math.max(0, top + px(Math.max(from, focus)) - hourPx * 1.5);
	});

	let scrollFrame = 0;

	/** Eases the scroll position, instantly for people who asked for less motion. */
	function scrollTo(target: number, ms = 350) {
		cancelAnimationFrame(scrollFrame);
		return new Promise<void>((resolve) => {
			if (!scroller) return resolve();
			const startAt = scroller.scrollTop;
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (reduced || startAt === target) {
				scroller.scrollTop = target;
				return resolve();
			}
			const began = performance.now();
			const step = (time: number) => {
				const t = Math.min(1, (time - began) / ms);
				scroller!.scrollTop = startAt + (target - startAt) * (1 - (1 - t) ** 3);
				if (t < 1) scrollFrame = requestAnimationFrame(step);
				else resolve();
			};
			scrollFrame = requestAnimationFrame(step);
		});
	}

	/** Opening keeps the view where it is, then scrolls up through the night. Closing scrolls down
	 * to the end of the night first, then folds it. */
	async function toggleNight() {
		if (!scroller) return;
		const shift = (range.from / 60) * hourPx;
		if (!nightOpen) {
			const before = scroller.scrollTop;
			nightOpen = true;
			await tick();
			scroller.scrollTop = before + shift;
			await scrollTo(0);
			return;
		}
		if (scroller.scrollTop < shift) await scrollTo(shift);
		nightOpen = false;
		await tick();
		if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollTop - shift);
	}

	// A new block comes into view
	$effect(() => {
		const id = highlight;
		if (id === null) return;
		void tick().then(() =>
			scroller?.querySelector(`[data-task="${id}"]`)?.scrollIntoView({ block: 'nearest' })
		);
	});
</script>

<div bind:this={scroller} bind:clientHeight={viewHeight} class="h-full overflow-y-auto select-none">
	{#if range.night > 0}
		<button
			type="button"
			class="bg-background text-muted-foreground hover:bg-muted/60 focus-visible:ring-ring tabular flex w-full cursor-pointer items-center justify-between border-b border-dashed px-4 text-xs select-none focus-visible:ring-2 focus-visible:outline-none"
			style="height: {ROW_PX}px"
			aria-expanded={nightOpen}
			onclick={toggleNight}
		>
			<span>Night, {formatClock(origin % DAY_MINUTES)} - {formatClock(day.start)}</span>
			{#if nightOpen}<ChevronUp class="size-4" />{:else}<ChevronDown class="size-4" />{/if}
		</button>
	{/if}

	<div
		class="grid {onAlarmSwitch
			? 'grid-cols-[3.5rem_1fr_13rem] xl:grid-cols-[3.5rem_1fr_17rem]'
			: 'grid-cols-[3.5rem_1fr]'}"
		style="height: {bodyPx}px"
	>
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
					{formatClock(timeAtOffset(hour * 60, origin))}
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
			{#if range.night > from}
				<div
					class="bg-info/10 pointer-events-none absolute inset-x-0 top-0"
					style="height: {px(range.night)}px"
				></div>
			{/if}

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

			{#each cards as card (card.row.alarm.id)}
				<!-- One hairline across the whole width, over the tasks so it never disappears behind one, thin and see-through so their text stays readable -->
				<div
					class="pointer-events-none absolute inset-x-0 z-10 border-t opacity-70 {ALARM_LINE[
						card.row.state
					]}"
					style="top: {card.y}px"
					aria-hidden="true"
				></div>
			{/each}

			{#each placements as { task, lane, span, lanes, overlaps } (task.id)}
				{@const dragging = drag?.id === task.id ? drag : null}
				{@const start = dragging?.startTime ?? task.startTime}
				{@const duration = dragging?.duration ?? task.duration}
				{@const done = task.status === TaskStatus.Completed}
				{@const box = blockBox(start, duration)}
				{@const slim = box.height < COMFY_MIN_BLOCK_PX}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-task={task.id}
					role="button"
					tabindex="0"
					aria-label="{task.title}, {formatClock(start)} to {formatClock(start + duration)}"
					class="group focus-visible:ring-ring absolute touch-none overflow-hidden rounded-lg border-l-4 px-2 shadow-sm select-none focus-visible:ring-2 focus-visible:outline-none
						{slim ? 'flex items-center' : 'py-1'}
						{priorityStyle[task.priority].block}
						{done ? 'opacity-55' : ''}
						{task.kind === 'travel' ? 'border-y border-r border-dashed border-current/50' : ''}
						{overlaps ? 'ring-warning ring-2 ring-inset' : ''}
						{highlight === task.id ? 'ring-foreground ring-2 ring-inset' : ''}
						{dragging ? 'z-10 cursor-grabbing shadow-lg' : 'cursor-grab'}"
					style="top: {box.top}px; height: {box.height}px; left: calc({(lane / lanes) *
						100}% + {GAP_PX}px); width: calc({(span / lanes) * 100}% - {2 * GAP_PX}px)"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => blockKey(e, task)}
					onpointerdown={(e) => begin(e, task, 'move')}
					onpointermove={track}
					onpointerup={(e) => finish(e, task)}
					onpointercancel={() => (drag = null)}
				>
					<!-- A block too short for the padding gets one centred line and a smaller circle -->
					<div class="flex min-w-0 flex-1 gap-1 {slim ? 'items-center' : 'items-start'}">
						<div class="min-w-0 flex-1">
							<div
								class="truncate text-sm font-medium {slim ? 'leading-4' : ''} {done
									? 'line-through'
									: ''}"
							>
								{task.title}
							</div>
							{#if box.height >= TWO_LINES_PX}
								<div class="tabular truncate text-xs opacity-80">
									{formatClock(start)} - {formatClock(start + duration)} · {formatDuration(
										duration
									)}{task.kind === 'appointment' ? ' · Appointment' : ''}
								</div>
							{/if}
						</div>
						{#if overlaps}
							<TriangleAlert
								class="size-4 shrink-0 {slim ? '' : 'mt-0.5'}"
								aria-label="Overlaps another task"
							/>
						{/if}
						<!-- The circle is as tall as the title line, the button around it is 40px wide so it is easy to hit -->
						<button
							type="button"
							class="-mx-2 -my-2.5 grid size-10 shrink-0 cursor-pointer place-items-center"
							aria-label={done ? 'Mark as not done' : 'Mark as done'}
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								onToggle(task);
							}}
						>
							<span
								class="grid place-items-center rounded-full border border-current/50 hover:bg-current/15 {slim
									? 'size-4'
									: 'size-5'} {done ? 'bg-current/20' : ''}"
							>
								{#if done}<Check class={slim ? 'size-3' : 'size-3.5'} />{/if}
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
						<!-- A slim block has no room under its title, the edge still resizes -->
						{#if !slim}<div class="mx-auto mt-1 h-0.5 w-8 rounded-full bg-current/40"></div>{/if}
					</div>
				</div>
			{/each}

			{#if draft}
				{@const box = blockBox(draft.startTime, draft.duration)}
				<div
					class="border-primary bg-primary/15 pointer-events-none absolute z-10 overflow-hidden rounded-lg border-l-4 px-2 py-1"
					style="top: {box.top}px; height: {box.height}px; left: {GAP_PX}px; right: {GAP_PX}px"
				>
					{#if !draft.drawing}
						<input
							use:focusOnMount
							bind:value={draft.title}
							class="pointer-events-auto block h-5 w-full bg-transparent p-0 text-sm leading-5 font-medium outline-none"
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
					<div
						class="tabular text-muted-foreground truncate text-xs {draft.drawing ||
						box.height >= TWO_LINES_PX
							? ''
							: 'hidden'}"
					>
						{formatClock(draft.startTime)} - {formatClock(draft.startTime + draft.duration)}
					</div>
				</div>
			{/if}

			<!-- What is past on today is dimmed, so what is left of the day shows at a glance -->
			{#each past as { a, b } (a)}
				<div
					class="bg-background/50 pointer-events-none absolute inset-x-0 z-5"
					style="top: {px(a)}px; height: {px(b) - px(a)}px"
				></div>
			{/each}

			{#if showNow && off(now) >= from && off(now) <= to}
				<div
					class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
					style="top: {px(off(now))}px"
				>
					<div class="bg-destructive -ml-1 size-2 rounded-full"></div>
					<div class="bg-destructive h-0.5 flex-1"></div>
				</div>
			{/if}
		</div>

		<!-- The alarms of this day in a lane that scrolls with the plan, each joined to its line by a connector -->
		{#if onAlarmSwitch}
			<div class="relative border-l" aria-label="Alarms">
				<svg
					class="pointer-events-none absolute top-0 left-0 w-3"
					height={bodyPx}
					aria-hidden="true"
				>
					{#each cards as card (card.row.alarm.id)}
						<path
							d="M0 {card.y} L12 {card.top + CARD_PX / 2}"
							fill="none"
							stroke-width="2"
							class={CONNECTOR[card.row.state]}
						/>
					{/each}
				</svg>
				{#each cards as { row, top } (row.alarm.id)}
					<div
						class="absolute right-1 left-3 flex items-center gap-2 rounded-lg border border-l-4 px-2 {ALARM_CARD[
							row.state
						]}"
						style="top: {top}px; height: {CARD_PX}px"
					>
						<button
							type="button"
							class="min-w-0 flex-1 cursor-pointer text-left"
							aria-label="Edit {row.alarm.label}"
							onclick={() => onAlarmEdit?.(row.alarm)}
						>
							<div class="flex items-baseline gap-2">
								<span class="tabular text-sm font-semibold">{formatClock(row.minutes)}</span>
								<span class="truncate text-sm">{row.alarm.label}</span>
							</div>
							<div class="text-muted-foreground truncate text-xs">
								{alarmStatus(row.alarm, row.state, dayName.format(row.alarm.fireAt))}
							</div>
						</button>
						<Switch
							size="sm"
							checked={row.alarm.enabled}
							onCheckedChange={(value) => onAlarmSwitch(row.alarm, value)}
							aria-label="{row.alarm.label} on or off"
						/>
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground -mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md"
							aria-label="Cancel {row.alarm.label}"
							title="Cancel"
							onclick={() => onAlarmCancel?.(row.alarm)}
						>
							<X class="size-4" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
