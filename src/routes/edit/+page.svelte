<script lang="ts">
	import { Clock, Edit, Plus, Trash2, Maximize2, Minimize2 } from 'lucide-svelte';
	import { Priority, type Task } from '$lib/types';
	import { deleteTask, updateTask } from '$lib';
	import { goto } from '$app/navigation';
	import { tasker } from '$lib/state.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import type { TaskForm as TaskFormType } from '$lib/types';

	const { data } = $props();

	let draggedTask: Task | null = $state(null);
	let isCompactView = $state(false);

	const form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: false,
		showTaskForm: false,
		title: '',
		description: '',
		duration: 60, // Default to 1 hour
		startTime: new Date(),
		priority: Priority.Medium
	});

	// Get today's date boundaries
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const priorityColors = {
		[Priority.Critical]: 'bg-error/80 border-error',
		[Priority.Urgent]: 'bg-warning/80 border-warning',
		[Priority.High]: 'bg-info/80 border-info',
		[Priority.Medium]: 'bg-secondary/80 border-secondary',
		[Priority.Low]: 'bg-base-300/80 border-base-300'
	};

	function formatTime(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function formatDuration(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours > 0) {
			return `${hours}h ${mins > 0 ? ` ${mins}m` : ''}`;
		}
		return `${mins}m`;
	}

	function openEditForm(e: Event, task: Task) {
		e.stopPropagation();
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.duration = task.duration;
		form.startTime = new Date(task.startTime * 1000);
		form.priority = task.priority;
		form.isEditing = true;
		form.showTaskForm = true;
	}

	function openTaskForm() {
		form.selectedTask = undefined;
		form.isEditing = false;
		form.title = '';
		form.description = '';
		form.duration = 60;
		form.startTime = new Date();
		form.priority = Priority.Medium;
		form.showTaskForm = true;
	}

	async function handleDelete(task: Task) {
		if (confirm('Are you sure you want to delete this task?')) {
			try {
				await deleteTask(task.id);
			} catch (error) {
				console.error('Failed to delete task:', error);
			}
		}
	}

	function handleTimeSlotClick(hour: number) {
		const newTime = new Date(today);
		newTime.setHours(hour);
		form.startTime = newTime;
		openTaskForm();
	}

	function handleDrop(event: DragEvent, hour: number) {
		event.preventDefault();
		if (!draggedTask) return;
		const newTime = new Date(today);
		newTime.setHours(hour);
		const startTime = Math.floor(newTime.getTime() / 1000);
		updateTask({ ...draggedTask, startTime });
	}
</script>

<div class="h-full flex flex-col bg-base-100">
	<!-- Header -->
	<div class="sticky top-0 p-4 border-b border-base-300 bg-base-100 z-30">
		<div class="flex items-center justify-between">
			<button class="btn btn-primary" onclick={() => goto('/')}>Back to Focus</button>
			<h1 class="text-2xl font-bold">Edit Tasks</h1>
			<div class="flex items-center gap-2">
				<button
					class="btn btn-ghost"
					onclick={() => isCompactView = !isCompactView}
					title={isCompactView ? 'Switch to Expanded View' : 'Switch to Compact View'}
				>
					{#if isCompactView}
						<Maximize2 class="h-5 w-5" />
					{:else}
						<Minimize2 class="h-5 w-5" />
					{/if}
				</button>
				<button
					class="btn btn-primary"
					onclick={openTaskForm}
				>
					<Plus class="h-4 w-4" />
					New Task
				</button>
			</div>
		</div>
	</div>

	<!-- Calendar Grid -->
	<div class="{isCompactView ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto'}">
		<div class="grid grid-cols-[80px_1fr] h-full">
			<!-- Time labels -->
			<div class="bg-base-100 border-r border-base-300 sticky left-0 z-20 {isCompactView ? 'flex flex-col' : ''}">
				{#each [...Array(24).keys()] as hour (hour)}
					<div class="{isCompactView ? 'flex-1 min-h-0' : 'h-14'} border-b border-base-300/50 flex items-start justify-end pr-2 pt-1">
						<span class="text-xs text-base-content/70 font-mono">
							{hour.toString().padStart(2, '0')}:00
						</span>
					</div>
				{/each}
			</div>

			<!-- Calendar body -->
			<div class="relative {isCompactView ? 'flex flex-col' : ''}">
				{#if isCompactView}
					<!-- Compact view: Tasks in flexbox layout -->
					{#each tasker.tasks as task (task.id)}
						<div
							class="pointer-events-auto cursor-move rounded-lg border-l-4 p-1 shadow-sm hover:shadow-md transition-shadow group {priorityColors[task.priority]} text-xs m-1"
							style="flex: {task.duration};"
							draggable="true"
							ondragstart={() => draggedTask = task}
							ondragend={() => draggedTask = null}
							role="document"
						>
							<div class="flex items-start justify-between gap-1 h-full">
								<div class="flex-1 min-w-0">
									<h3 class="font-medium text-xs text-base-content truncate">
										{task.title}
									</h3>
								</div>
								<div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										class="btn btn-ghost btn-xs"
										onclick={(e) => openEditForm(e, task)}
									>
										<Edit class="h-3 w-3" />
									</button>
									<button
										class="btn btn-ghost btn-xs text-error"
										onclick={(e) => { e.stopPropagation(); handleDelete(task); }}
									>
										<Trash2 class="h-3 w-3" />
									</button>
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<!-- Expanded view: Traditional time slots -->
					{#each [...Array(24).keys()] as hour (hour)}
						<button
							class="w-full h-14 border-b border-base-300/50 hover:bg-base-200/50 cursor-pointer relative block"
							onclick={() => handleTimeSlotClick(hour)}
							ondrop={(e) => handleDrop(e, hour)}
							ondragover={(e) => e.preventDefault()}
						>
							<!-- Time slot content -->
						</button>
					{/each}

					<!-- Tasks overlay for expanded view -->
					<div class="absolute inset-0 pointer-events-none">
						{#each tasker.tasks as task (task.id)}
							{@const taskDate = new Date(task.startTime * 1000)}
							{@const startMinutes = taskDate.getHours() * 60 + taskDate.getMinutes()}
							{@const topPixels = (startMinutes / 60) * 56}
							{@const heightPixels = (task.duration / 60) * 56}
							<div
								class="absolute pointer-events-auto cursor-move rounded-lg border-l-4 p-2 shadow-sm hover:shadow-md transition-shadow group {priorityColors[task.priority]}"
								style="top: {topPixels}px; height: {heightPixels}px; left: 0%; width: 100%;"
								draggable="true"
								ondragstart={() => draggedTask = task}
								ondragend={() => draggedTask = null}
								role="document"
							>
								<div class="flex items-start justify-between gap-1 h-full">
									<div class="flex-1 min-w-0">
										<h3 class="font-medium text-sm text-base-content truncate">
											{task.title}
										</h3>
										<p class="text-xs text-base-content/70 flex items-center gap-1 mt-1">
											<Clock class="h-3 w-3" />
											{formatTime(task.startTime)} • {formatDuration(task.duration)}
										</p>
										<!--{#if task.description}
											<p class="text-xs text-base-content/60 mt-1 line-clamp-2">
												{task.description}
											</p>
										{/if}-->
									</div>
									<div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											class="btn btn-ghost btn-xs"
											onclick={(e) => openEditForm(e, task)}
										>
											<Edit class="h-3 w-3" />
										</button>
										<button
											class="btn btn-ghost btn-xs text-error"
											onclick={(e) => { e.stopPropagation(); handleDelete(task); }}
										>
											<Trash2 class="h-3 w-3" />
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Task Form Modal -->
<TaskForm email={data.user?.email || ''} {form} />
