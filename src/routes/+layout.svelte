<script lang="ts">
	import '../app.css';
	import { Calendar, Moon, Sun, User, Volume2, VolumeX } from 'lucide-svelte';
	import { Priority, TaskStatus } from '$lib/types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { tasker } from '$lib/state.svelte';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	tasker.tasks = data.tasks;

	let sidebarOpen = $state(false);
	let profileMenuOpen = $state(false);
	let isDarkMode = $state(false);

	// Initialize theme from localStorage or system preference
	onMount(() => {
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			isDarkMode = savedTheme === 'dark';
		} else {
			isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	});

	$effect(() => {
		localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
	});

	const priorityColors = {
		[Priority.Critical]: 'badge-error',
		[Priority.Urgent]: 'badge-warning',
		[Priority.High]: 'badge-info',
		[Priority.Medium]: 'badge-secondary',
		[Priority.Low]: 'badge-ghost'
	};

	const statusColors = {
		[TaskStatus.Completed]: 'text-success',
		[TaskStatus.Active]: 'text-info',
		[TaskStatus.Overdue]: 'text-error',
		[TaskStatus.Pending]: 'text-base-content'
	};

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

{#if profileMenuOpen}
	<button class="fixed inset-0 z-10" aria-label="Close Profile Menu" onclick={handleOutsideClick}></button>
{/if}

<div class="drawer h-screen">
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
			<button class="navbar-center cursor-pointer" onclick={() => goto('/')}>
				<img src="/logo.svg" alt="Logo" class="h-10 mr-1"><span class="text-xl font-bold">ADHD Tasker</span>
			</button>

			<!-- Right side - Sound toggle, theme toggle and profile -->
			<div class="navbar-end gap-2">
				<!-- Sound toggle -->
				<button
					class="btn btn-ghost btn-circle"
					onclick={() => tasker.isMuted = !tasker.isMuted}
					title={tasker.isMuted ? 'Unmute sounds' : 'Mute sounds'}
				>
					{#if tasker.isMuted}
						<VolumeX class="h-5 w-5" />
					{:else}
						<Volume2 class="h-5 w-5" />
					{/if}
				</button>

				<!-- Dark mode toggle -->
				<label class="swap swap-rotate">
					<!-- this hidden checkbox controls the state -->
					<input
						type="checkbox"
						class="theme-controller"
						value={isDarkMode ? 'aqua' : 'cupcake'}
						onchange={() => isDarkMode = !isDarkMode}
					/>

					<!-- sun icon (light mode) -->
					<Sun class="swap-off h-6 w-6" />

					<!-- moon icon (dark mode) -->
					<Moon class="swap-on h-6 w-6" />
				</label>

				<!-- Profile dropdown -->
				<form method="POST" class="dropdown dropdown-end dropdown-open" action="?/login" use:enhance>
					<button
						class="btn btn-ghost btn-circle"
						type="button"
						onclick={() => profileMenuOpen = !profileMenuOpen}
					>
						<User class="h-5 w-5" />
					</button>

					{#if profileMenuOpen}
						<ul class="dropdown-content menu bg-base-100 rounded-box w-52 p-2 shadow-lg border border-base-300 z-20">
							{#if data.user}
								<li class="menu-title text-sm opacity-70">{data.user.email}</li>
							{:else}
								<li>
									<button>Log in</button>
								</li>
							{/if}
							<div class="divider my-1"></div>
							<li><a href="/edit" onclick={() => profileMenuOpen = false}>Edit Tasks</a></li>
							<li><a href="/settings" onclick={() => profileMenuOpen = false}>Settings</a></li>
							{#if data.user}
								<div class="divider my-1"></div>
								<li>
									<button formaction="?/logout" onclick={() => profileMenuOpen = false}>Log out</button>
								</li>
							{/if}
						</ul>
					{/if}
				</form>
			</div>
		</div>

		<!-- Page content -->
		<main class="flex-1">
			{@render children()}
		</main>
	</div>

	<!-- Sidebar -->
	<div class="drawer-side z-40">
		<button aria-label="Sidebar Toggle" class="drawer-overlay" onclick={() => sidebarOpen = false}><label
			for="sidebar-toggle" class="w-full h-full"></label></button>
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
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
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
										<div class="badge {priorityColors[task.priority]} badge-sm">
											P{task.priority}
										</div>
									</div>

									<div class="flex items-center justify-between mt-2">
										<div class="flex items-center gap-2 text-xs">
											<span class="font-mono">{formatTime(task.startTime)}</span>
											<span class="opacity-50">•</span>
											<span>{formatDuration(task.duration)}</span>
										</div>
										<div class="badge badge-outline badge-xs {statusColors[task.status]}">
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