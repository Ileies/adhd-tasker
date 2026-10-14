<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import TaskList from '#lib/components/TaskList.svelte';
	import ActiveTaskDisplay from '#lib/components/ActiveTaskDisplay.svelte';
	import { Priority, TaskStatus } from '#lib/types.js';
	import { playSound, updateTask } from '#lib';
	import { minutesNow } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Clock, Focus } from '@lucide/svelte';

	let now = $state(minutesNow(tasker.timezone));

	const activeTasks = $derived(tasker.tasks.filter((task) => {
		return task.status === TaskStatus.Pending && task.startTime <= now && now < task.startTime + task.duration;
	}).sort((a, b) => (b.priority || Priority.Medium) - (a.priority || Priority.Medium)));

	setInterval(() => {
		now = minutesNow(tasker.timezone);
		tasker.timeLeft = tasker.activeTask ? (tasker.activeTask.startTime + tasker.activeTask.duration) - now : 0;
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

	const stats = $derived([
		{ label: 'Total', value: tasker.tasks.length, class: 'text-primary' },
		{ label: 'Active', value: tasker.activeTask ? 1 : 0, class: 'text-success' },
		{ label: 'Done', value: tasker.tasks.filter((t) => t.status === 'completed').length, class: 'text-info' }
	]);
</script>

<!-- Main application interface -->
<div class="container mx-auto max-w-6xl px-4 py-8">
	<header class="mb-8 text-center">
		<h2 class="text-xl text-muted-foreground">Stay focused, one task at a time</h2>
	</header>

	{#if tasker.activeTask}
		{#if tasker.isFullScreen}
			<ActiveTaskDisplay />
		{:else}
			<!-- Active task banner (when not in full screen) -->
			<Card.Root class="mb-6 bg-primary/10 ring-primary/30">
				<Card.Content class="flex items-center gap-4">
					<div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/20">
						<Clock class="size-6 text-primary" />
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-lg font-semibold">Current Task: {tasker.activeTask.title}</h3>
						<p class="text-sm text-muted-foreground">
							Time remaining: {Math.floor(tasker.timeLeft / 60) + ':' + (tasker.timeLeft % 60).toString().padStart(2, '0')}
						</p>
					</div>
					<Button onclick={() => (tasker.isFullScreen = !tasker.isFullScreen)}>Focus Mode</Button>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}

	<!-- Task management section -->
	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<div class="lg:col-span-1">
			<div class="sticky top-8">
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-primary">Quick Actions</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="grid grid-cols-3 gap-2 text-center">
							{#each stats as stat (stat.label)}
								<div class="rounded-lg bg-muted/50 p-3">
									<div class="text-xs text-muted-foreground">{stat.label}</div>
									<div class="text-3xl font-bold {stat.class}">{stat.value}</div>
								</div>
							{/each}
						</div>

						{#if tasker.activeTask}
							<Button variant="secondary" size="lg" class="w-full" onclick={() => (tasker.isFullScreen = !tasker.isFullScreen)}>
								<Focus />
								Enter Focus Mode
							</Button>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		</div>

		<!-- Task list -->
		<div class="lg:col-span-2">
			<TaskList />
		</div>
	</div>
</div>
