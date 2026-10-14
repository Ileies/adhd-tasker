<script lang="ts">
	import { Clock, Edit, Plus, Trash2, Maximize2, Minimize2 } from '@lucide/svelte';
	import { Priority, type Task } from '#lib/types.js';
	import { deleteTask, updateTask } from '#lib';
	import { goto } from '$app/navigation';
	import { tasker } from '#lib/app.svelte.js';
	import { minutesNow } from '#lib/time.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { priorityStyle } from '#lib/urgency.js';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import type { TaskForm as TaskFormType } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as AlertDialog from '#lib/components/ui/dialog/index.js';

	const { data } = $props();

	let draggedTask: Task | null = $state(null);
	let isCompactView = $state(false);

	let form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: false,
		showTaskForm: false,
		title: '',
		description: '',
		duration: 60, // Default to 1 hour
		startTime: minutesNow(tasker.timezone),
		priority: Priority.Medium
	});

	function openEditForm(e: Event, task: Task) {
		e.stopPropagation();
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.duration = task.duration;
		form.startTime = task.startTime;
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
		form.startTime = minutesNow(tasker.timezone);
		form.priority = Priority.Medium;
		form.showTaskForm = true;
	}

	let taskToDelete: Task | null = $state(null);

	function handleDelete(event: Event, task: Task) {
		event.stopPropagation();
		taskToDelete = task;
	}

	async function confirmDelete() {
		if (taskToDelete) await deleteTask(taskToDelete);
		taskToDelete = null;
	}

	function handleDrop(event: DragEvent, hour: number) {
		event.preventDefault();
		if (draggedTask) updateTask({ ...draggedTask, startTime: hour * 60 });
	}
</script>

<div class="h-full flex flex-col bg-background">
	<!-- Header -->
	<div class="sticky top-0 p-4 border-b bg-background z-30">
		<div class="flex items-center justify-between">
			<Button onclick={() => goto('/')}>Back to Now</Button>
			<h1 class="text-2xl font-bold">Edit Tasks</h1>
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={() => isCompactView = !isCompactView}
					title={isCompactView ? 'Switch to Expanded View' : 'Switch to Compact View'}
					aria-label={isCompactView ? 'Switch to Expanded View' : 'Switch to Compact View'}
				>
					{#if isCompactView}
						<Maximize2 class="h-5 w-5" />
					{:else}
						<Minimize2 class="h-5 w-5" />
					{/if}
				</Button>
				<Button onclick={openTaskForm}>
					<Plus />
					New Task
				</Button>
			</div>
		</div>
	</div>

	<!-- Calendar Grid -->
	<div class="{isCompactView ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto'}">
		<div class="grid grid-cols-[80px_1fr] h-full">
			<!-- Time labels -->
			<div class="bg-background border-r sticky left-0 z-20 {isCompactView ? 'flex flex-col' : ''}">
				{#each [...Array(24).keys()] as hour (hour)}
					<div class="{isCompactView ? 'flex-1 min-h-0' : 'h-14'} border-b border-border/50 flex items-start justify-end pr-2 pt-1">
						<span class="text-xs text-muted-foreground font-mono">
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
							class="pointer-events-auto cursor-move rounded-lg border-l-4 p-1 shadow-sm hover:shadow-md transition-shadow group {priorityStyle[task.priority].block} text-xs m-1"
							style="flex: {task.duration};"
							draggable="true"
							ondragstart={() => draggedTask = task}
							ondragend={() => draggedTask = null}
							role="document"
						>
							<div class="flex items-start justify-between gap-1 h-full">
								<div class="flex-1 min-w-0">
									<h3 class="font-medium text-xs truncate">
										{task.title}
									</h3>
								</div>
								<div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button variant="ghost" size="icon-xs" aria-label="Edit task" onclick={(e) => openEditForm(e, task)}>
										<Edit />
									</Button>
									<Button variant="ghost" size="icon-xs" class="text-destructive" aria-label="Delete task" onclick={(e) => handleDelete(e, task)}>
										<Trash2 />
									</Button>
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<!-- Expanded view: Traditional time slots -->
					{#each [...Array(24).keys()] as hour (hour)}
						<button
							class="w-full h-14 border-b border-border/50 hover:bg-muted/50 cursor-pointer relative block"
							aria-label="Create task at {hour.toString().padStart(2, '0')}:00"
							onclick={() => {openTaskForm();form.startTime = hour * 60;}}
							ondrop={(e) => handleDrop(e, hour)}
							ondragover={(e) => e.preventDefault()}
						>
							<!-- Time slot content -->
						</button>
					{/each}

					<!-- Tasks overlay for expanded view -->
					<div class="absolute inset-0 pointer-events-none">
						{#each tasker.tasks as task (task.id)}
							{@const topPixels = (task.startTime / 60) * 56}
							{@const heightPixels = (task.duration / 60) * 56}
							<div
								class="absolute pointer-events-auto cursor-move rounded-lg border-l-4 p-2 shadow-sm hover:shadow-md transition-shadow group {priorityStyle[task.priority].block}"
								style="top: {topPixels}px; height: {heightPixels}px; left: 0%; width: 100%;"
								draggable="true"
								ondragstart={() => draggedTask = task}
								ondragend={() => draggedTask = null}
								role="document"
							>
								<div class="flex items-start justify-between gap-1 h-full">
									<div class="flex-1 min-w-0">
										<h3 class="font-medium text-sm truncate">
											{task.title}
										</h3>
										<p class="text-xs opacity-70 flex items-center gap-1 mt-1">
											<Clock class="h-3 w-3" />
											{formatClock(task.startTime)} • {formatDuration(task.duration)}
										</p>
										<!--{#if task.description}
											<p class="text-xs text-base-content/60 mt-1 line-clamp-2">
												{task.description}
											</p>
										{/if}-->
									</div>
									<div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<Button variant="ghost" size="icon-xs" aria-label="Edit task" onclick={(e) => openEditForm(e, task)}>
											<Edit />
										</Button>
										<Button variant="ghost" size="icon-xs" class="text-destructive" aria-label="Delete task" onclick={(e) => handleDelete(e, task)}>
											<Trash2 />
										</Button>
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

<!-- Delete confirmation -->
<AlertDialog.Root open={taskToDelete !== null} onOpenChange={(open) => { if (!open) taskToDelete = null; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this task?</AlertDialog.Title>
			<AlertDialog.Description>
				"{taskToDelete?.title}" will be removed from your schedule.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="ghost" onclick={() => (taskToDelete = null)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Task Form Modal -->
<TaskForm email={data.user?.email || ''} bind:form={form} />
