<script lang="ts">
	import { Priority, TaskStatus } from '$lib/types';
	import { tasker } from '$lib/app.svelte.js';
	import { deleteTask, updateTask } from '$lib';

	const priorityLabels: Record<Priority, string> = {
		[Priority.Low]: 'Low',
		[Priority.Medium]: 'Medium',
		[Priority.High]: 'High',
		[Priority.Urgent]: 'Urgent',
		[Priority.Critical]: 'Critical'
	};

	const priorityColors: Record<Priority, string> = {
		[Priority.Low]: 'badge-success',
		[Priority.Medium]: 'badge-info',
		[Priority.High]: 'badge-warning',
		[Priority.Urgent]: 'badge-error',
		[Priority.Critical]: 'badge-error'
	};

	function formatDateTime(timestamp: number): string {
		return Math.floor(timestamp / 60) + ':' + (timestamp % 60).toString().padStart(2, '0');
	}

	function formatDuration(minutes: number): string {
		if (minutes > 59) {
			return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
		}
		return `${minutes % 60}m`;
	}

	// Sort tasks by start time
	const sortedTasks = $derived([...tasker.tasks].sort((a, b) => a.startTime - b.startTime));

	// Group tasks by status
	const pendingTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Pending));
	const activeTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Active));
	const completedTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Completed));
</script>

<div class="space-y-6">
	<!-- Active Tasks -->
	{#if activeTasks.length > 0}
		<div class="card bg-primary/10 border border-primary/20">
			<div class="card-body">
				<h3 class="card-title text-primary">
					<span class="badge badge-primary">Active</span>
					Active Tasks
				</h3>
				<div class="space-y-3">
					{#each activeTasks as task (task.id)}
						<div class="alert alert-info">
							<div class="flex-1">
								<h4 class="font-semibold">{task.title}</h4>
								{#if task.description}
									<p class="text-sm opacity-75">{task.description}</p>
								{/if}
								<div class="flex items-center gap-2 mt-2">
									<span class="badge {priorityColors[task.priority]}">
										{priorityLabels[task.priority]}
									</span>
									<span class="text-xs">
										{formatDateTime(task.startTime)}
									</span>
									<span class="text-xs">
										Duration: {formatDuration(task.duration)}
									</span>
								</div>
							</div>
							<div class="flex-none">
								<button
									class="btn btn-success btn-sm"
									onclick={() => updateTask({ ...task, status: TaskStatus.Completed })}
								>
									Complete
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Pending Tasks -->
	{#if pendingTasks.length > 0}
		<div class="card bg-base-100 shadow-lg">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-ghost">Pending</span>
					Upcoming Tasks
				</h3>
				<div class="space-y-3">
					{#each pendingTasks as task (task.id)}
						<div class="alert">
							<div class="flex-1">
								<h4 class="font-semibold">{task.title}</h4>
								{#if task.description}
									<p class="text-sm opacity-75">{task.description}</p>
								{/if}
								<div class="flex items-center gap-2 mt-2">
									<span class="badge {priorityColors[task.priority]}">
										{priorityLabels[task.priority]}
									</span>
									<span class="text-xs">
										{formatDateTime(task.startTime)}
									</span>
									<span class="text-xs">
										Duration: {formatDuration(task.duration)}
									</span>
								</div>
							</div>
							<div class="flex-none">
								<div class="dropdown dropdown-end">
									<div tabindex="0" role="button" class="btn btn-ghost btn-sm">
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
										</svg>
									</div>
									<ul class="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
										<li>
											<button
												class="text-success"
												onclick={() => updateTask({ ...task, status: TaskStatus.Completed })}
											>
												Mark Complete
											</button>
										</li>
										<li>
											<button
												class="text-error"
												onclick={() => deleteTask(task)}
											>
												Delete
											</button>
										</li>
									</ul>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Completed Tasks -->
	{#if completedTasks.length > 0}
		<div class="card bg-success/10 border border-success/20">
			<div class="card-body">
				<h3 class="card-title text-success">
					<span class="badge badge-success">Completed</span>
					Completed Tasks
				</h3>
				<div class="space-y-3">
					{#each completedTasks.slice(-5) as task (task.id)}
						<div class="alert alert-success">
							<div class="flex-1">
								<h4 class="font-semibold">{task.title}</h4>
								{#if task.description}
									<p class="text-sm opacity-75">{task.description}</p>
								{/if}
								<div class="flex items-center gap-2 mt-2">
									<span class="badge {priorityColors[task.priority]}">
										{priorityLabels[task.priority]}
									</span>
									<span class="text-xs">
										{formatDateTime(task.startTime)}
									</span>
									<span class="text-xs">
										Duration: {formatDuration(task.duration)}
									</span>
								</div>
							</div>
							<div class="flex-none">
								<button
									class="btn btn-error btn-sm btn-outline"
									onclick={() => deleteTask(task)}
								>
									Delete
								</button>
							</div>
						</div>
					{/each}
					{#if completedTasks.length > 5}
						<p class="text-sm text-center opacity-50">
							... and {completedTasks.length - 5} more completed tasks
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Empty State -->
	{#if tasker.tasks.length === 0}
		<div class="card bg-base-100 shadow-lg">
			<div class="card-body text-center">
				<h3 class="card-title justify-center">No Tasks Yet</h3>
				<p class="opacity-75">Create your first task to get started with your ADHD management journey!</p>
				<div class="mt-4">
					<svg class="mx-auto w-16 h-16 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
					</svg>
				</div>
			</div>
		</div>
	{/if}
</div> 