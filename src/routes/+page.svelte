<script lang="ts">
	import { tasker } from '$lib/app.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import ActiveTaskDisplay from '$lib/components/ActiveTaskDisplay.svelte';
	import { Priority, TaskStatus } from '$lib/types';
	import { playSound, updateTask } from '$lib';

	// neuer chat button, builder wirft error -> feld kann nicht bearbeitet werden "feld existiert bereits", bitte füll alle Pflichtfelder aus?!
	// nicht alle chats immer anzeigen, fehler beim löschen der Kategorie, history sieht schlecht aus,
	// chat löschen button funktionieren machen und verschieben

	const activeTasks = $derived(tasker.tasks.filter((task) => {
		const now = Math.floor(Date.now() / 1000 / 60); // Current time in minutes
		return task.status === TaskStatus.Pending && task.startTime <= now && now < task.startTime + task.duration;
	}).sort((a, b) => (b.priority || Priority.Medium) - (a.priority || Priority.Medium)));

	setInterval(() => {
		tasker.timeLeft = tasker.activeTask ? (tasker.activeTask.startTime + tasker.activeTask.duration) - Math.floor(Date.now() / 1000 / 60) : 0;
	}, 1000);

	// Play reminder sound every 5 minutes while a task is active
	setInterval(() => {
		if (tasker.activeTask) playSound('reminder')
	}, 300000);

	$effect(() => {
		if (!tasker.tasks || activeTasks.length == 0) {
			tasker.activeTask = null;
			return;
		}

		// If this is a different task, play sound and update
		if (tasker.activeTask?.id !== activeTasks[0].id) {
			tasker.activeTask = activeTasks[0];
			updateTask({ ...tasker.activeTask, status: TaskStatus.Active });
			playSound('task-started')
		}
	});
</script>

<!-- Main application interface -->
<div class="container mx-auto px-4 py-8 max-w-6xl">
	<header class="text-center mb-8">
		<h2 class="text-xl opacity-75">
			Stay focused, one task at a time
		</h2>
	</header>

	{#if tasker.activeTask}
		{#if tasker.isFullScreen}
			<ActiveTaskDisplay />
		{:else}
			<!-- Active task banner (when not in full screen) -->
			<div class="alert alert-info mb-6 shadow-lg">
			<div class="flex-1">
				<div class="flex items-center gap-4">
					<div class="flex-shrink-0">
						<div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
							<svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
						</div>
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-lg">Current Task: {tasker.activeTask.title}</h3>
						<p class="text-sm opacity-75">
							Time remaining: {Math.floor(tasker.timeLeft / 60) + ':' + (tasker.timeLeft % 60).toString().padStart(2, '0')}
						</p>
					</div>
				</div>
			</div>
			<div class="flex-none">
				<button
					class="btn btn-primary btn-sm"
					onclick={() => tasker.isFullScreen = !tasker.isFullScreen}
				>
					Focus Mode
				</button>
			</div>
		</div>
		{/if}
	{/if}

	<!-- Task management section -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
		<!-- Task creation and controls -->
		<div class="lg:col-span-1">
			<div class="sticky top-8">
					<div class="card bg-base-100 shadow-lg">
						<div class="card-body">
							<h2 class="card-title text-primary">Quick Actions</h2>

							<!-- Stats -->
							<div class="stats stats-vertical shadow">
								<div class="stat">
									<div class="stat-title">Total Tasks</div>
									<div class="stat-value text-primary">{tasker.tasks.length}</div>
								</div>
								<div class="stat">
									<div class="stat-title">Active Now</div>
									<div class="stat-value text-success">
										{tasker.activeTask ? 1 : 0}
									</div>
								</div>
								<div class="stat">
									<div class="stat-title">Completed</div>
									<div class="stat-value text-info">
										{tasker.tasks.filter(t => t.status === 'completed').length}
									</div>
								</div>
							</div>

							<!-- Focus mode button -->
							{#if tasker.activeTask}
								<button
									class="btn btn-secondary w-full mt-4"
									onclick={() => tasker.isFullScreen = !tasker.isFullScreen}
								>
									<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
									</svg>
									Enter Focus Mode
								</button>
							{/if}
						</div>
					</div>
			</div>
		</div>

		<!-- Task list -->
		<div class="lg:col-span-2">
			<TaskList />
		</div>
	</div>

	<!-- Footer -->
	<footer class="text-center mt-16 py-8 border-t border-base-300">
		<p class="text-sm opacity-50">
			ADHD Tasker - Helping you stay focused, one task at a time 🎯
		</p>
		<p class="text-xs opacity-30 mt-2">
			Built with SvelteKit and DaisyUI, 3 days before an exam :)
		</p>
	</footer>
</div>
