<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Check, Plus, Rows2, Rows4, TriangleAlert } from '@lucide/svelte';
	import { clearFlag, readFlags, setFlag } from '#lib/flags.js';
	import { addAlarm, loadSchedule } from '#lib/alarms.js';
	import { dayPanelAlarms } from '#lib/alarmview.js';
	import { quickAlarmFields, quickAlarmPreview } from '#lib/quickalarm.js';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import MicButton from '#lib/components/MicButton.svelte';
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
	import { minutesNow, todayIn } from '#lib/time.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { DAY_MINUTES, SNAP, overlapLine, phoneGroups } from '#lib/plan.js';
	import {
		QUICK_DURATION as DEFAULT_DURATION,
		QUICK_START as DEFAULT_START,
		quickPreview
	} from '#lib/quickadd.js';
	import { joinHeard } from '#lib/taskform.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { loadAllDay } from '#lib/calendar.js';
	import AlarmPanel from '#lib/components/AlarmPanel.svelte';
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
	// Compact fits the whole day on the screen. A per-device preference, not part of the plan
	let compact = $state(untrack(() => readFlags().compactPlan));

	function setCompact(value: boolean) {
		compact = value;
		if (value) setFlag('compactPlan');
		else clearFlag('compactPlan');
	}
	onMount(() => void loadSchedule().catch(() => {}));
	// The alarms stand in the day at their clock time
	const alarmMarkers = $derived(
		dayPanelAlarms(
			tasker.schedule.alarms,
			selected,
			tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
		).map(({ alarm, state, minutes }) => ({ id: alarm.id, label: alarm.label, minutes, state }))
	);
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
	let mode = $state<'task' | 'alarm'>('task');
	const setMode = (value: 'task' | 'alarm') => {
		mode = value;
		quickInput?.focus();
	};
	const alarmFields = $derived(quickAlarmFields(quick));
	const alarmPreview = $derived(quickAlarmPreview(quick));
	const preview = $derived(
		mode === 'alarm'
			? (alarmPreview ?? (quick.trim() ? 'Add a time: 7:00, 8am or in 10 min' : null))
			: quickPreview(quick, selected, selected === today ? now : null)
	);
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

	const voice = tasker.voice;
	let micMessage = $state('');
	/** The line under the field: only there when it has something to say. */
	const hint = $derived(
		voice.recording
			? 'Listening, release to fill in'
			: voice.transcribing
				? 'Understanding...'
				: micMessage || preview || ''
	);

	/** What was said lands in the field, so the preview shows and Add stays one tap. */
	function fillHeard(text: string) {
		quick = joinHeard(quick, text);
		quickInput?.focus();
	}

	async function addQuick(event: Event) {
		event.preventDefault();
		if (mode === 'alarm') {
			if (!alarmFields) return;
			const failure = await addAlarm(alarmFields);
			if (!failure) quick = '';
			showToast(failure ?? `Alarm set: ${alarmPreview?.replace(/^Rings /, '')}`);
			return;
		}
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
</script>

<svelte:head>
	<title>Plan - ADHD Tasker</title>
</svelte:head>

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
		class="z-30 flex flex-col gap-1 border-b p-3 {hint
			? 'pb-1'
			: ''} max-md:order-last max-md:border-t max-md:border-b-0 sm:px-6"
		onsubmit={addQuick}
	>
		<div class="flex gap-2">
			<SegmentedControl
				label="What to add"
				value={mode}
				onselect={setMode}
				options={[
					{ value: 'task', label: 'Task' },
					{ value: 'alarm', label: 'Alarm' }
				]}
			/>
			<!-- One field with its tools inside, so the bar reads as a single control -->
			<div
				class="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-11 min-w-0 flex-1 items-center rounded-lg border pr-1 focus-within:ring-3 md:h-10"
			>
				<Input
					bind:ref={quickInput}
					bind:value={quick}
					class="h-full min-w-0 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
					placeholder={mode === 'alarm'
						? 'Add an alarm: Meds 8:00 daily, Tea in 5 min'
						: 'Add a task: Call dentist 14:30 45m'}
					aria-label={mode === 'alarm' ? 'Quick add an alarm' : 'Quick add a task'}
				/>
				<MicButton onheard={fillHeard} onmessage={(text) => (micMessage = text)} />
				{#if mode === 'task'}
					<Button
						variant="ghost"
						size="icon"
						class="size-9 shrink-0"
						type="button"
						aria-label="More options"
						title="More options"
						onclick={() => openTaskForm()}
					>
						<Plus />
					</Button>
				{/if}
			</div>
			<Button
				type="submit"
				class="h-11 px-5 md:h-10"
				disabled={mode === 'alarm' ? !alarmFields : !quick.trim()}>Add</Button
			>
			<!-- A quiet icon at the far end. The phone shows a list, not a timeline, so it has no layout to choose -->
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="text-muted-foreground size-11 shrink-0 max-md:hidden md:size-10"
				aria-pressed={compact}
				aria-label={compact ? 'Comfortable layout' : 'Compact layout'}
				title={compact ? 'Comfortable layout' : 'Compact layout, fits the day on screen'}
				onclick={() => setCompact(!compact)}
			>
				{#if compact}<Rows2 />{:else}<Rows4 />{/if}
			</Button>
		</div>
		{#if hint}
			<p class="text-muted-foreground h-5 truncate text-sm" role="status" aria-live="polite">
				{hint}
			</p>
		{/if}
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
		<div class="hidden h-full md:flex">
			<div class="h-full min-w-0 flex-1">
				<DayTimeline
					date={selected}
					tasks={dayTasks}
					{now}
					showNow={selected === today}
					alarms={alarmMarkers}
					{highlight}
					{compact}
					day={{ start: tasker.settings.myDayStart, end: tasker.settings.myDayEnd }}
					onEdit={openEditForm}
					onAdd={addBlock}
					onMove={move}
					onResize={resize}
					onToggle={toggle}
				/>
			</div>
			<!-- Wide screens only: the alarms of this day beside the plan -->
			<div class="hidden h-full w-80 shrink-0 border-l xl:block 2xl:w-96">
				<AlarmPanel date={selected} />
			</div>
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
