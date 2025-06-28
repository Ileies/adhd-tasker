<script lang="ts">
	import '../app.css';
	import { User, VolumeX, Volume2, Calendar } from 'lucide-svelte';
	import { Priority, TaskStatus } from '$lib/types';
	import { enhance } from '$app/forms';

	let { children, data } = $props();

	let sidebarOpen = $state(false);
	let profileMenuOpen = $state(false);
	let soundMuted = $state(false);

	function getPriorityColor(priority: Priority): string {
		switch (priority) {
			case Priority.Critical: return 'badge-error';
			case Priority.Urgent: return 'badge-warning';
			case Priority.High: return 'badge-info';
			case Priority.Medium: return 'badge-secondary';
			default: return 'badge-ghost';
		}
	}

	function getStatusColor(status: TaskStatus): string {
		switch (status) {
			case TaskStatus.Completed: return 'text-success';
			case TaskStatus.Active: return 'text-info';
			case TaskStatus.Overdue: return 'text-error';
			default: return 'text-base-content';
		}
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours > 0) {
			return `${hours}h ${mins}m`;
		}
		return `${mins}m`;
	}

	// Close menus when clicking outside
	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.dropdown') && !target.closest('.drawer-side')) {
			profileMenuOpen = false;
		}
	}
</script>

<svelte:window onclick={handleOutsideClick} />

<div class="drawer h-screen overflow-hidden">
	<input id="sidebar-toggle" type="checkbox" class="drawer-toggle" bind:checked={sidebarOpen} />

	<!-- Main content -->
	<div class="drawer-content flex flex-col h-full">
		<!-- Navbar -->
		<div class="navbar bg-base-100 border-b border-base-300 flex-shrink-0">
			<!-- Left side - Sidebar toggle -->
			<div class="navbar-start">
				<button
					class="btn btn-ghost btn-circle"
					onclick={() => sidebarOpen = true}
				>
					<Calendar class="h-5 w-5" />
				</button>
			</div>

			<!-- Center - App title -->
			<div class="navbar-center">
				<span class="text-xl font-bold">ADHD Tasker</span>
			</div>

			<!-- Right side - Sound toggle and profile -->
			<div class="navbar-end gap-2">
				<!-- Sound toggle -->
				<button
					class="btn btn-ghost btn-circle"
					onclick={() => soundMuted = !soundMuted}
					title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
				>
					{#if soundMuted}
						<VolumeX class="h-5 w-5" />
					{:else}
						<Volume2 class="h-5 w-5" />
					{/if}
				</button>

				<!-- Profile dropdown -->
				<form method="POST" class="dropdown dropdown-end" action="?/login" use:enhance>
					<button
						class="btn btn-ghost btn-circle"
						type="button"
						onclick={() => profileMenuOpen = !profileMenuOpen}
					>
						<User class="h-5 w-5" />
					</button>

					{#if profileMenuOpen}
						<ul class="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow-lg border border-base-300">
							{#if data.user}
								<li class="menu-title">
									<span class="text-sm opacity-70">{data.user.email}</span>
								</li>
								<div class="divider my-1"></div>
								<li><a href="/edit">Edit Tasks</a></li>
								<li><a href="#settings">Settings</a></li>
								<div class="divider my-1"></div>
								<li><button formaction="?/logout">Log out</button></li>
							{:else}
								<li><button>Log in</button></li>
							{/if}
						</ul>
					{/if}
				</form>
			</div>
		</div>

		<!-- Page content -->
		<main class="flex-1 overflow-auto">
			{@render children()}
		</main>
	</div>

	<!-- Sidebar -->
	<div class="drawer-side z-40">
		<label for="sidebar-toggle" class="drawer-overlay" onclick={() => sidebarOpen = false}></label>
		<aside class="min-h-full w-80 bg-base-200 flex flex-col">
			<!-- Sidebar header -->
			<div class="p-4 border-b border-base-300">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold">Today's Tasks</h2>
					<button
						class="btn btn-ghost btn-sm btn-circle"
						onclick={() => sidebarOpen = false}
						aria-label="Close sidebar"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
			</div>

			<!-- Tasks list -->
			<div class="flex-1 overflow-auto p-4">
				{#if data.tasks.length === 0}
					<div class="text-center text-base-content/70 mt-8">
						<Calendar class="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>No tasks for today</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each data.tasks as task (task.id)}
							<div class="card bg-base-100 shadow-sm border border-base-300">
								<div class="card-body p-3">
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1 min-w-0">
											<h3 class="font-medium text-sm truncate">{task.title}</h3>
											{#if task.description}
												<p class="text-xs text-base-content/70 mt-1 line-clamp-2">{task.description}</p>
											{/if}
										</div>
										<div class="badge {getPriorityColor(task.priority)} badge-sm">
											P{task.priority}
										</div>
									</div>

									<div class="flex items-center justify-between mt-2">
										<div class="flex items-center gap-2 text-xs">
											<span class="font-mono">{formatTime(task.startTime)}</span>
											<span class="opacity-50">•</span>
											<span>{formatDuration(task.duration)}</span>
										</div>
										<div class="badge badge-outline badge-xs {getStatusColor(task.status)}">
											{task.status}
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>