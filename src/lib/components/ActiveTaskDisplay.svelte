<script lang="ts">
	import { Priority } from '$lib/types';
	import { tasker } from '$lib/app.svelte.js';
	import { updateTask } from '$lib';
	import { TaskStatus } from '$lib/types.js';

	function getPriorityLabel(priority: Priority): string {
		switch (priority) {
			case Priority.Low:
				return 'Low Priority';
			case Priority.Medium:
				return 'Medium Priority';
			case Priority.High:
				return 'High Priority';
			case Priority.Urgent:
				return 'Urgent';
			case Priority.Critical:
				return 'Critical!';
			default:
				return 'Medium Priority';
		}
	}

	function getPriorityIcon(priority: Priority): string {
		switch (priority) {
			case Priority.Low:
				return '🟢';
			case Priority.Medium:
				return '🟡';
			case Priority.High:
				return '🟠';
			case Priority.Urgent:
				return '🔴';
			case Priority.Critical:
				return '🚨';
		}
	}

	function getProgressPercentage(): number {
		if (!tasker.activeTask) return 0;
		return 100 - 100 * tasker.timeLeft / tasker.activeTask.duration;
	}

	function getProgressColor(): string {
		const progress = getProgressPercentage();
		if (progress < 50) return 'progress-success';
		if (progress < 80) return 'progress-warning';
		return 'progress-error';
	}

	const backgroundClass = $derived(tasker.activeTask ? (tasker.timeLeft / tasker.activeTask.duration > 0.8 ? 'bg-success' : tasker.timeLeft / tasker.activeTask.duration > 0.5 ? 'bg-warning' : 'bg-error') : 'bg-base-100');
</script>

<!-- ESC key handler -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && tasker.activeTask) {
			tasker.isFullScreen = !tasker.isFullScreen;
		}
	}}
/>

{#if tasker.activeTask}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-1000 {backgroundClass}">

		<!-- Main task display -->
		<div class="relative w-full max-w-4xl mx-auto text-center">
			<!-- Close button -->
			<button
				class="absolute top-0 right-0 btn btn-circle btn-ghost btn-lg z-10"
				onclick={() => tasker.isFullScreen = !tasker.isFullScreen}
				aria-label="Close Task Display"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
				</svg>
			</button>

			<!-- Priority indicator -->
			<div class="mb-8">
				<div class="text-6xl mb-4">
					{getPriorityIcon(tasker.activeTask.priority || Priority.Medium)}
				</div>
				<div class="text-xl font-medium opacity-75">
					{getPriorityLabel(tasker.activeTask.priority || Priority.Medium)}
				</div>
			</div>

			<!-- Task title -->
			<h1 class="text-4xl md:text-6xl font-bold mb-6 leading-tight">
				{tasker.activeTask.title}
			</h1>

			<!-- Task description -->
			{#if tasker.activeTask.description}
				<p class="text-xl md:text-2xl opacity-80 mb-8 max-w-2xl mx-auto leading-relaxed">
					{tasker.activeTask.description}
				</p>
			{/if}

			<!-- Time remaining -->
			<div class="mb-8">
				<div class="text-5xl md:text-7xl font-mono font-bold mb-4">
					{Math.floor(tasker.timeLeft / 60) + ':' + (tasker.timeLeft % 60).toString().padStart(2, '0')}
				</div>
				<div class="text-lg opacity-75">
					Time Remaining
				</div>
			</div>

			<!-- Progress bar -->
			<div class="mb-8 max-w-md mx-auto">
				<progress
					class="progress {getProgressColor()} w-full h-4"
					value={getProgressPercentage()}
					max="100"
				></progress>
				<div class="text-sm opacity-75 mt-2">
					{Math.round(getProgressPercentage())}% Complete
				</div>
			</div>

			<!-- Complete task button -->
			<button
				class="btn btn-success btn-lg text-xl px-12 py-4 hover:scale-105 transition-transform duration-200"
				onclick={() => tasker.activeTask && updateTask({ ...tasker.activeTask, status: TaskStatus.Completed })}
			>
				<svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
				</svg>
				Complete Task
			</button>

			<!-- Instructions -->
			<div class="mt-8 text-sm opacity-60">
				<p>Click "Complete Task" when you're done, or press ESC to minimize</p>
			</div>
		</div>

		<!-- Floating elements for visual interest -->
		<div class="absolute top-10 left-10 opacity-10 animate-pulse">
			<svg class="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
			</svg>
		</div>

		<div class="absolute bottom-10 right-10 opacity-10 animate-pulse">
			<svg class="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
				<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
		</div>
	</div>
{/if}
