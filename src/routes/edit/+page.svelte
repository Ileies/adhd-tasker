<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, Plus, TriangleAlert } from '@lucide/svelte';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';
	import {
		addQuickTask,
		createTask,
		deleteTask,
		errorText,
		loadDay,
		showToast,
		updateTask
	} from '#lib';
	import { tasker } from '#lib/app.svelte.js';
	import { addDays, minutesNow, todayIn } from '#lib/time.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { DAY_MINUTES, SNAP, overlapLine, phoneGroups } from '#lib/plan.js';
	import {
		QUICK_DURATION as DEFAULT_DURATION,
		QUICK_START as DEFAULT_START,
		quickPreview
	} from '#lib/quickadd.js';
	import { shortcutFor } from '#lib/shortcuts.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { loadAllDay } from '#lib/calendar.js';
	import DayTimeline from '#lib/components/DayTimeline.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const HIGHLIGHT_MS = 2000;

	let now = $state(minutesNow(tasker.timezone));
	let today = $state(todayIn(tasker.timezone));
	// The day lives in `tasker` because the bar's day switcher changes it. Plan always opens on today
	const selected = $derived(tasker.plan.date ?? today);
	untrack(() => (tasker.plan.date = today));
	let quick = $state('');
	let quickInput: HTMLInputElement | null = $state(null);
	/** The block that was just added: scrolled into view and outlined for a moment. */
	let highlight = $state<number | null>(null);
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const timer = setInterval(() => {
			now = minutesNow(tasker.timezone);
			today = todayIn(tasker.timezone);
		}, 15_000);
		return () => clearInterval(timer);
	});

	// Always refresh the selected day, it may have been changed elsewhere (another device, the assistant later)
	$effect(() => {
		const date = selected;
		void untrack(() =>
			loadDay(date).catch((error) => showToast(errorText(error, 'Could not load this day')))
		);
	});

	// All-day calendar events are not tasks, they are one line above the day
	$effect(() => {
		const date = selected;
		void untrack(() => loadAllDay(date));
	});

	const dayTasks = $derived(tasker.tasks.filter((task) => task.date === selected));
	const overlap = $derived(overlapLine(dayTasks));
	const groups = $derived(phoneGroups(dayTasks, selected === today ? now : null));
	const preview = $derived(quickPreview(quick, selected, selected === today ? now : null));
	let doneOpen = $state(false);

	let form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: false,
		showTaskForm: false,
		title: '',
		description: '',
		date: untrack(() => today),
		duration: DEFAULT_DURATION,
		startTime: DEFAULT_START,
		priority: Priority.Medium
	});

	function openEditForm(task: Task) {
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.date = task.date;
		form.duration = task.duration;
		form.startTime = task.startTime;
		form.priority = task.priority;
		form.isEditing = true;
		form.showTaskForm = true;
	}

	function openTaskForm(startTime = defaultStart()) {
		form.selectedTask = undefined;
		form.isEditing = false;
		form.title = '';
		form.description = '';
		form.date = selected;
		form.duration = DEFAULT_DURATION;
		form.startTime = startTime;
		form.priority = Priority.Medium;
		form.showTaskForm = true;
	}

	/** The next free quarter hour when planning today, the morning otherwise. */
	function defaultStart() {
		if (selected !== today) return DEFAULT_START;
		return Math.min(DAY_MINUTES - DEFAULT_DURATION, Math.ceil(now / SNAP) * SNAP);
	}

	/** Outlines the task that appeared since `before`, so the eye finds it. */
	function showNew(before: Set<number>) {
		const created = tasker.tasks.find((task) => task.date === selected && !before.has(task.id));
		if (!created) return;
		highlight = created.id;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlight = null), HIGHLIGHT_MS);
	}

	async function addQuick(event: Event) {
		event.preventDefault();
		const text = quick;
		quick = '';
		const before = new Set(tasker.tasks.map((task) => task.id));
		if (await addQuickTask(text, selected, selected === today ? now : null)) showNew(before);
	}

	/** A block drawn on the timeline: title typed in place, no dialog. */
	async function addBlock(title: string, startTime: number, duration: number) {
		const before = new Set(tasker.tasks.map((task) => task.id));
		try {
			await createTask({
				title,
				description: '',
				date: selected,
				startTime,
				duration,
				priority: Priority.Medium
			});
			showToast(`Added ${title} at ${formatClock(startTime)}`);
			showNew(before);
		} catch (error) {
			showToast(errorText(error, 'Could not add the task'));
		}
	}

	function toggle(task: Task) {
		const before = task.status;
		const status = before === TaskStatus.Completed ? TaskStatus.Pending : TaskStatus.Completed;
		void updateTask({ ...task, status });
		showToast(
			status === TaskStatus.Completed ? `Done: ${task.title}` : `Reopened: ${task.title}`,
			() => updateTask({ ...task, status: before })
		);
	}

	function move(task: Task, startTime: number) {
		void updateTask({ ...task, startTime });
		showToast(`${task.title} moved to ${formatClock(startTime)}`, () => updateTask(task));
	}

	function resize(task: Task, duration: number) {
		void updateTask({ ...task, duration });
		showToast(`${task.title} now ${formatDuration(duration)}`, () => updateTask(task));
	}

	function remove(task: Task) {
		const { id: _id, ...rest } = task;
		void deleteTask(task);
		showToast(`Deleted: ${task.title}`, () => createTask(rest));
	}

	// N or / go to the quick add line, the arrows and T change the day
	function pageKey(event: KeyboardEvent) {
		if (document.querySelector('[role="dialog"]')) return;
		const action = shortcutFor(event);
		if (action === 'quick') {
			event.preventDefault();
			quickInput?.focus();
		} else if (action === 'previous') tasker.plan.date = addDays(selected, -1);
		else if (action === 'next') tasker.plan.date = addDays(selected, 1);
		else if (action === 'today') tasker.plan.date = today;
	}
</script>

<svelte:head>
	<title>Plan - ADHD Tasker</title>
</svelte:head>

<svelte:window onkeydown={pageKey} />

{#snippet row(task: Task, current = false)}
	{@const done = task.status === TaskStatus.Completed}
	<li
		class="flex items-center gap-3 px-4 py-2 {done ? 'opacity-55' : ''} {current
			? priorityStyle[task.priority].block
			: ''}"
	>
		<button
			type="button"
			class="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
			onclick={() => openEditForm(task)}
		>
			<span class="tabular w-12 shrink-0 text-sm {current ? '' : 'text-muted-foreground'}"
				>{formatClock(task.startTime)}</span
			>
			<span class="min-w-0 flex-1">
				<span class="block truncate font-medium {done ? 'line-through' : ''}">{task.title}</span>
				<span class="text-xs {current ? '' : 'text-muted-foreground'}"
					>{formatDuration(task.duration)}</span
				>
			</span>
			<span class="shrink-0 rounded-full px-2 py-0.5 text-xs {priorityStyle[task.priority].chip}">
				{priorityStyle[task.priority].label}
			</span>
		</button>
		<Button
			variant={done ? 'default' : 'outline'}
			size="icon"
			aria-label={done ? 'Mark as not done' : 'Mark as done'}
			onclick={() => toggle(task)}
		>
			<Check />
		</Button>
	</li>
{/snippet}

<div class="bg-background flex h-full flex-col">
	<form
		class="z-30 flex flex-col gap-1 border-b p-3 max-md:order-last max-md:border-t max-md:border-b-0 sm:px-6"
		onsubmit={addQuick}
	>
		<div class="flex gap-2">
			<Input
				bind:ref={quickInput}
				bind:value={quick}
				class="h-11 flex-1 text-base"
				placeholder="Add a task: Call dentist 14:30 45m"
				aria-label="Quick add a task"
			/>
			<Button
				variant="outline"
				size="icon-lg"
				type="button"
				aria-label="More options"
				title="More options"
				onclick={() => openTaskForm()}
			>
				<Plus />
			</Button>
			<Button type="submit" size="lg" disabled={!quick.trim()}>Add</Button>
		</div>
		<!-- Always there, so the line under the field does not jump the page -->
		<p class="text-muted-foreground h-5 truncate text-sm" aria-live="polite">{preview ?? ''}</p>
	</form>

	{#if tasker.calendar.allDay.length > 0}
		<p class="border-b px-6 py-2 text-sm">
			<span class="text-muted-foreground">All day:</span>
			{tasker.calendar.allDay.map((line) => line.title).join(', ')}
		</p>
	{/if}

	{#if overlap}
		<div class="bg-warning/15 flex items-center gap-2 border-b px-6 py-2 text-sm" role="status">
			<TriangleAlert class="size-4 shrink-0" />
			{overlap}
		</div>
	{/if}

	<div class="min-h-0 flex-1">
		<!-- Wide screens: timeline with drag and resize -->
		<div class="hidden h-full md:block">
			<DayTimeline
				date={selected}
				tasks={dayTasks}
				{now}
				showNow={selected === today}
				{highlight}
				day={{ start: tasker.settings.myDayStart, end: tasker.settings.myDayEnd }}
				onEdit={openEditForm}
				onAdd={addBlock}
				onMove={move}
				onResize={resize}
				onToggle={toggle}
			/>
		</div>

		<!-- Phones: the same day as a plain list -->
		<div class="h-full overflow-y-auto md:hidden">
			{#if dayTasks.length === 0}
				<p class="text-muted-foreground p-6">Nothing planned. Add something below.</p>
			{:else}
				{#if groups.done.length > 0}
					<div class="border-b">
						<button
							type="button"
							class="text-muted-foreground flex min-h-11 w-full items-center px-4 text-left text-sm"
							aria-expanded={doneOpen}
							onclick={() => (doneOpen = !doneOpen)}
						>
							{groups.done.length} done
						</button>
						{#if doneOpen}
							<ul class="divide-y">
								{#each groups.done as task (task.id)}{@render row(task)}{/each}
							</ul>
						{/if}
					</div>
				{/if}
				{#if groups.missed.length > 0}
					<h2 class="text-muted-foreground px-4 pt-3 text-sm font-semibold">Earlier</h2>
					<ul class="divide-y">
						{#each groups.missed as task (task.id)}{@render row(task)}{/each}
					</ul>
				{/if}
				{#if groups.current.length > 0}
					<h2 class="text-muted-foreground px-4 pt-3 pb-1 text-sm font-semibold">Now</h2>
					<ul>
						{#each groups.current as task (task.id)}{@render row(task, true)}{/each}
					</ul>
				{/if}
				{#if groups.later.length > 0}
					{#if selected === today}
						<h2 class="text-muted-foreground px-4 pt-3 text-sm font-semibold">Later</h2>
					{/if}
					<ul class="divide-y">
						{#each groups.later as task (task.id)}{@render row(task)}{/each}
					</ul>
				{/if}
			{/if}
		</div>
	</div>
</div>

<TaskForm bind:form onDelete={remove} />
