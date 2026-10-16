<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { Check, CircleHelp, Plus, Rows2, Rows4, TriangleAlert } from '@lucide/svelte';
	import { clearFlag, readFlags, setFlag } from '#lib/flags.js';
	import { addAlarm, cancelAlarm, loadSchedule, switchAlarm } from '#lib/alarms.js';
	import { dayPanelAlarms } from '#lib/alarmview.js';
	import { quickAlarmFields, quickAlarmPreview } from '#lib/quickalarm.js';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import MicButton from '#lib/components/MicButton.svelte';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';
	import { createTask, errorText, loadDay, showToast, updateTask } from '#lib';
	import { dropTask } from '#lib/prepare.js';
	import { tasker, type Alarm } from '#lib/app.svelte.js';
	import type { Todo } from '#lib/core/repo.js';
	import { addQuickLine, chooseTodo, finishTodo } from '#lib/todos.js';
	import { minutesNow, todayIn } from '#lib/time.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { DAY_MINUTES, SNAP, overlapLine, phoneGroups } from '#lib/plan.js';
	import { placeDay, stored, type Placed } from '#lib/placeday.js';
	import {
		QUICK_DURATION as DEFAULT_DURATION,
		QUICK_START as DEFAULT_START,
		quickPreview,
		quickTaskKind
	} from '#lib/quickadd.js';
	import type { TaskKind } from '#lib/core/repo.js';
	import { joinHeard } from '#lib/taskform.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { loadAllDay } from '#lib/calendar.js';
	import DayTimeline from '#lib/components/DayTimeline.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import TodoPanel from '#lib/components/TodoPanel.svelte';
	import TodoSheet from '#lib/components/TodoSheet.svelte';
	import QuickAddHelp from '#lib/components/QuickAddHelp.svelte';
	import AlarmForm from '#lib/components/AlarmForm.svelte';
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
	// The alarms stand in the day: a line at their time and a card in the lane beside it
	const alarmRows = $derived(
		dayPanelAlarms(
			tasker.schedule.alarms,
			selected,
			tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
		)
	);

	let editing = $state<Alarm | null>(null);
	let helpOpen = $state(false);

	async function switchAlarmFor(alarm: Alarm, enabled: boolean) {
		const failure = await switchAlarm(alarm, enabled);
		if (failure) showToast(failure);
	}
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

	// The day as it will be lived: tasks that may move have made room. Everything that saves goes through `stored`
	const dayTasks = $derived(placeDay(tasker.tasks.filter((task) => task.date === selected)));
	const overlap = $derived(overlapLine(dayTasks));
	const groups = $derived(phoneGroups(dayTasks, selected === today ? now : null));
	let mode = $state<'task' | 'alarm'>('task');
	const setMode = (value: 'task' | 'alarm') => {
		mode = value;
		quickInput?.focus();
	};
	const alarmFields = $derived(quickAlarmFields(quick));
	const alarmPreview = $derived(quickAlarmPreview(quick));
	/** What the user tapped on the chip, the words of the line decide until then. */
	let chosenKind = $state<TaskKind | null>(null);
	const quickKindNow = $derived(quickTaskKind(quick, chosenKind));
	const preview = $derived(
		mode === 'alarm'
			? (alarmPreview ?? (quick.trim() ? 'Add a time: 7:00, 8am or in 10 min' : null))
			: quickPreview(quick, selected, selected === today ? now : null, today, chosenKind)
	);
	let doneOpen = $state(false);

	// To do and Fixed times side by side on wide screens, one at a time on phones
	let view = $state<'todo' | 'times'>('todo');
	let editingTodo = $state<Todo | null>(null);

	async function doNow(todo: Todo) {
		await chooseTodo(todo);
		await goto('/');
	}

	let form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: false,
		showTaskForm: false,
		title: '',
		description: '',
		date: untrack(() => today),
		duration: DEFAULT_DURATION,
		startTime: DEFAULT_START,
		priority: Priority.Medium,
		kind: 'block',
		shift: 0
	});

	function openEditForm(placed: Task) {
		const task = stored(placed);
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.date = task.date;
		form.duration = task.duration;
		form.startTime = task.startTime;
		form.priority = task.priority;
		form.kind = task.kind;
		form.shift = task.shift;
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
		form.kind = 'block';
		form.shift = 0;
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
			// Read the preview before the field is cleared, it is derived from the field
			const when = alarmPreview?.replace(/^Rings /, '');
			const label = alarmFields.label;
			const failure = await addAlarm(alarmFields);
			if (!failure) quick = '';
			showToast(failure ?? `Alarm set: ${label} ${when}`);
			return;
		}
		const text = quick;
		const kind = chosenKind;
		quick = '';
		chosenKind = null;
		const before = new Set(tasker.tasks.map((task) => task.id));
		const made = await addQuickLine(text, selected, selected === today ? now : null, today, kind);
		if (made?.kind === 'task') showNew(before);
		// An appointment asks how to get there and what to prepare, one tap can skip it
		if (made?.kind === 'task' && made.task.kind === 'appointment')
			tasker.prep.appointment = made.task;
		// On a phone a new task shows in the other tab, so go where it is
		if (made?.kind === 'task') view = 'times';
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

	function toggle(placed: Task) {
		const task = stored(placed);
		const before = task.status;
		const status = before === TaskStatus.Completed ? TaskStatus.Pending : TaskStatus.Completed;
		void updateTask({ ...task, status });
		showToast(
			status === TaskStatus.Completed ? `Done: ${task.title}` : `Reopened: ${task.title}`,
			() => updateTask({ ...task, status: before })
		);
	}

	// A drag decides the time: the user saw the task where it was placed and put it somewhere
	function move(placed: Task, startTime: number) {
		const task = stored(placed);
		void updateTask({ ...task, startTime });
		showToast(`${task.title} moved to ${formatClock(startTime)}`, () => updateTask(task));
	}

	function resize(placed: Task, duration: number) {
		const task = stored(placed);
		void updateTask({ ...task, duration });
		showToast(`${task.title} now ${formatDuration(duration)}`, () => updateTask(task));
	}

	function remove(task: Task) {
		void dropTask(stored(task));
	}
</script>

<svelte:head>
	<title>Plan - ADHD Tasker</title>
</svelte:head>

{#snippet row(task: Task | Placed<Task>, current = false)}
	{@const done = task.status === TaskStatus.Completed}
	{@const movedFor = 'movedFor' in task ? task.movedFor : null}
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
					>{formatDuration(task.duration)}{movedFor ? ` · moved for ${movedFor}` : ''}</span
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
					{ value: 'task', label: 'Add' },
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
						: 'Add: Study Math 10h by friday, Call dentist 14:30'}
					aria-label={mode === 'alarm' ? 'Quick add an alarm' : 'Quick add a to-do or task'}
				/>
				<Button
					variant="ghost"
					size="icon"
					class="text-muted-foreground size-9 shrink-0"
					type="button"
					aria-label="How quick add works"
					title="How quick add works"
					onclick={() => (helpOpen = true)}
				>
					<CircleHelp />
				</Button>
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
			<div class="flex h-5 items-center gap-2">
				<p class="text-muted-foreground min-w-0 truncate text-sm" role="status" aria-live="polite">
					{hint}
				</p>
				<!-- The words chose it, one tap says otherwise -->
				{#if mode === 'task' && quickKindNow}
					<button
						type="button"
						class="text-muted-foreground hover:bg-muted shrink-0 cursor-pointer rounded-full border px-2 text-xs"
						aria-pressed={quickKindNow === 'appointment'}
						onclick={() => (chosenKind = quickKindNow === 'appointment' ? 'block' : 'appointment')}
					>
						{quickKindNow === 'appointment' ? 'Make it a task' : 'Make it an appointment'}
					</button>
				{/if}
			</div>
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

	<!-- Phones show one of the two, the tabs choose -->
	<div class="border-b px-4 py-2 md:hidden">
		<SegmentedControl
			label="Show"
			value={view}
			onselect={(value) => (view = value)}
			options={[
				{ value: 'todo', label: 'To do' },
				{ value: 'times', label: 'Fixed times' }
			]}
		/>
	</div>

	<div class="min-h-0 flex-1 md:grid md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
		<div class="min-h-0 overflow-y-auto md:border-r {view === 'todo' ? 'h-full' : 'max-md:hidden'}">
			<TodoPanel
				todos={tasker.todos}
				tasks={tasker.tasks.filter((task) => task.kind === 'appointment')}
				{today}
				onOpen={(todo) => (editingTodo = todo)}
				onNow={doNow}
				onDone={(todo) => finishTodo(todo)}
			/>
		</div>

		<div class="min-h-0 {view === 'times' ? 'h-full' : 'max-md:hidden'}">
			<!-- Wide screens: timeline with drag and resize -->
			<div class="hidden h-full md:block">
				<DayTimeline
					date={selected}
					tasks={dayTasks}
					{now}
					showNow={selected === today}
					alarms={alarmRows}
					onAlarmSwitch={switchAlarmFor}
					onAlarmCancel={cancelAlarm}
					onAlarmEdit={(alarm) => (editing = alarm)}
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
</div>

<TaskForm bind:form onDelete={remove} />
<TodoSheet bind:todo={editingTodo} />
<AlarmForm bind:alarm={editing} />
<QuickAddHelp
	bind:open={helpOpen}
	{mode}
	onuse={(text) => {
		quick = text;
		quickInput?.focus();
	}}
/>
