<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, ChevronLeft, ChevronRight, Plus, TriangleAlert } from '@lucide/svelte';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';
	import { createTask, deleteTask, errorText, loadDay, showToast, updateTask } from '#lib';
	import { goto } from '$app/navigation';
	import { tasker } from '#lib/app.svelte.js';
	import { addDays, formatDay, isDateKey, minutesNow, todayIn } from '#lib/time.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { DAY_MINUTES, SNAP, layoutDay } from '#lib/plan.js';
	import { parseQuickTask } from '#lib/quickadd.js';
	import { priorityStyle } from '#lib/urgency.js';
	import DayTimeline from '#lib/components/DayTimeline.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const { data } = $props();

	const DEFAULT_DURATION = 30;
	const DEFAULT_START = 9 * 60;

	let now = $state(minutesNow(tasker.timezone));
	let today = $state(todayIn(tasker.timezone));
	let selected = $state(untrack(() => today));
	let quick = $state('');

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

	const dayTasks = $derived(tasker.tasks.filter((task) => task.date === selected));
	const sorted = $derived([...dayTasks].sort((a, b) => a.startTime - b.startTime || a.id - b.id));
	const overlapCount = $derived(layoutDay(dayTasks).filter((p) => p.overlaps).length);

	let form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: false,
		showTaskForm: false,
		title: '',
		description: '',
		date: untrack(() => today),
		duration: 60,
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
		form.duration = 60;
		form.startTime = startTime;
		form.priority = Priority.Medium;
		form.showTaskForm = true;
	}

	/** The next free quarter hour when planning today, the morning otherwise. */
	function defaultStart() {
		if (selected !== today) return DEFAULT_START;
		return Math.min(DAY_MINUTES - DEFAULT_DURATION, Math.ceil(now / SNAP) * SNAP);
	}

	function addQuick(event: Event) {
		event.preventDefault();
		const parsed = parseQuickTask(quick);
		if (!parsed.title) return;
		const duration = Math.min(parsed.duration ?? DEFAULT_DURATION, DAY_MINUTES);
		const startTime = Math.min(parsed.startTime ?? defaultStart(), DAY_MINUTES - duration);
		quick = '';
		createTask({
			title: parsed.title,
			description: '',
			date: selected,
			startTime,
			duration,
			priority: Priority.Medium,
			email: data.user?.email ?? ''
		}).then(
			() => showToast(`Added ${parsed.title} at ${formatClock(startTime)}`),
			(error) => showToast(errorText(error, 'Could not add the task'))
		);
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

	function shift(days: number) {
		selected = addDays(selected, days);
	}
</script>

<svelte:head>
	<title>Plan - ADHD Tasker</title>
</svelte:head>

<div class="bg-background flex h-full flex-col">
	<div class="z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b p-3 sm:px-6">
		<Button variant="outline" onclick={() => goto('/')}>Back to Now</Button>

		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" aria-label="Previous day" onclick={() => shift(-1)}
				><ChevronLeft /></Button
			>
			<h1 class="min-w-32 text-center text-xl font-bold">{formatDay(selected, today)}</h1>
			<Button variant="ghost" size="icon" aria-label="Next day" onclick={() => shift(1)}
				><ChevronRight /></Button
			>
			<Input
				type="date"
				class="w-40"
				aria-label="Pick a date"
				value={selected}
				onchange={(e) => isDateKey(e.currentTarget.value) && (selected = e.currentTarget.value)}
			/>
			{#if selected !== today}
				<Button variant="ghost" onclick={() => (selected = today)}>Today</Button>
			{/if}
		</div>

		<form class="flex min-w-60 flex-1 gap-2" onsubmit={addQuick}>
			<Input
				bind:value={quick}
				placeholder="Quick add: Call dentist 14:30 45m"
				aria-label="Quick add a task"
			/>
			<Button type="submit" disabled={!quick.trim()}>Add</Button>
		</form>

		<Button variant="outline" onclick={() => openTaskForm()}>
			<Plus />
			Details
		</Button>
	</div>

	{#if overlapCount > 0}
		<div class="bg-warning/15 flex items-center gap-2 border-b px-6 py-2 text-sm" role="status">
			<TriangleAlert class="size-4 shrink-0" />
			Some tasks overlap. Now shows the one with the higher priority.
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
				onEdit={openEditForm}
				onCreate={openTaskForm}
				onMove={move}
				onResize={resize}
				onToggle={toggle}
			/>
		</div>

		<!-- Phones: the same day as a plain list -->
		<div class="h-full overflow-y-auto md:hidden">
			{#if sorted.length === 0}
				<p class="text-muted-foreground p-6">Nothing planned. Add something above.</p>
			{:else}
				<ul class="divide-y">
					{#each sorted as task (task.id)}
						{@const done = task.status === TaskStatus.Completed}
						<li class="flex items-center gap-3 px-4 py-3 {done ? 'opacity-55' : ''}">
							<button
								type="button"
								class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
								onclick={() => openEditForm(task)}
							>
								<span class="tabular text-muted-foreground w-12 shrink-0 text-sm"
									>{formatClock(task.startTime)}</span
								>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium {done ? 'line-through' : ''}"
										>{task.title}</span
									>
									<span class="text-muted-foreground text-xs">{formatDuration(task.duration)}</span>
								</span>
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-xs {priorityStyle[task.priority]
										.chip}"
								>
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
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<TaskForm email={data.user?.email || ''} bind:form onDelete={remove} />
