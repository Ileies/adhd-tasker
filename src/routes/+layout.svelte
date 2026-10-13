<script lang="ts">
	import '../app.css';
	import { Calendar, User, Volume2, VolumeX } from '@lucide/svelte';
	import { Priority, TaskStatus } from '#lib/types.js';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { tasker } from '#lib/app.svelte.js';
	import DarkModeSwitch from '#lib/components/DarkModeSwitch.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { browser } from '$app/env';
	import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_REDIRECT_URI } from '$app/env/public';

	let { children, data } = $props();

	if (browser) tasker.tasks = data.user ? data.tasks : JSON.parse(localStorage.getItem('tasks') || '[]');

	let sidebarOpen = $state(false);
	let loginForm: HTMLFormElement | undefined = $state();
	let logoutForm: HTMLFormElement | undefined = $state();

	const priorityColors = {
		[Priority.Critical]: 'bg-destructive text-white',
		[Priority.Urgent]: 'bg-warning text-warning-foreground',
		[Priority.High]: 'bg-info text-info-foreground',
		[Priority.Medium]: 'bg-secondary text-secondary-foreground',
		[Priority.Low]: 'bg-muted text-muted-foreground'
	};

	const statusColors = {
		[TaskStatus.Completed]: 'text-success',
		[TaskStatus.Active]: 'text-info',
		[TaskStatus.Overdue]: 'text-destructive',
		[TaskStatus.Pending]: 'text-foreground'
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
</script>

<!-- Hidden forms: dropdown content is portaled, so it cannot live inside a form -->
<form method="POST" action="?/login" use:enhance bind:this={loginForm} class="hidden"></form>
<form method="POST" action="?/logout" use:enhance bind:this={logoutForm} class="hidden"></form>

<div class="flex h-screen flex-col">
	<!-- Navbar -->
	<header class="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-background px-2 py-1">
		<div class="flex">
			<Button variant="ghost" size="icon-lg" onclick={() => (sidebarOpen = true)} aria-label="Open today's tasks">
				<Calendar class="h-5 w-5" />
			</Button>
		</div>

		<button class="flex cursor-pointer items-center" onclick={() => goto('/')}>
			<img src="/logo.svg" alt="Logo" class="mr-1 h-10" /><span class="text-xl font-bold">ADHD Tasker</span>
		</button>

		<div class="flex items-center justify-end gap-1">
			<Button
				variant="ghost"
				size="icon-lg"
				onclick={() => (tasker.isMuted = !tasker.isMuted)}
				title={tasker.isMuted ? 'Unmute sounds' : 'Mute sounds'}
				aria-label={tasker.isMuted ? 'Unmute sounds' : 'Mute sounds'}
			>
				{#if tasker.isMuted}
					<VolumeX class="h-5 w-5" />
				{:else}
					<Volume2 class="h-5 w-5" />
				{/if}
			</Button>

			<DarkModeSwitch />

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-lg" aria-label="Profile menu">
							<User class="h-5 w-5" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-52">
					{#if data.user}
						<DropdownMenu.Label class="truncate">{data.user.email}</DropdownMenu.Label>
					{:else}
						<DropdownMenu.Item onSelect={() => loginForm?.requestSubmit()}>Log in</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => goto('/edit')}>Edit Tasks</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/settings')}>Settings</DropdownMenu.Item>
					{#if data.user}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>Log out</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<!-- Page content -->
	<main class="min-h-0 flex-1 overflow-auto">
		{@render children()}
	</main>
</div>

<!-- Sidebar -->
<Sheet.Root bind:open={sidebarOpen}>
	<Sheet.Content side="left" class="w-80 bg-muted/40">
		<Sheet.Header class="border-b">
			<Sheet.Title class="text-lg">Today's Tasks</Sheet.Title>
			<Sheet.Description class="sr-only">All tasks scheduled for today</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-auto p-4">
			{#if data.tasks.length === 0}
				<div class="mt-8 text-center text-muted-foreground">
					<Calendar class="mx-auto mb-4 h-12 w-12 opacity-50" />
					<p>No tasks for today</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each data.tasks as task (task.id)}
						<Card.Root size="sm">
							<Card.Content>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<h3 class="truncate text-sm font-medium">{task.title}</h3>
										{#if task.description}
											<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
										{/if}
									</div>
									<Badge class={priorityColors[task.priority]}>P{task.priority}</Badge>
								</div>

								<div class="mt-2 flex items-center justify-between">
									<div class="flex items-center gap-2 text-xs">
										<span class="font-mono">{formatTime(task.startTime)}</span>
										<span class="opacity-50">•</span>
										<span>{formatDuration(task.duration)}</span>
									</div>
									<Badge variant="outline" class={statusColors[task.status]}>{task.status}</Badge>
								</div>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

<div
	id="g_id_onload"
	data-client_id={PUBLIC_GOOGLE_CLIENT_ID}
	data-login_uri={PUBLIC_REDIRECT_URI}
	data-auto_select="true"
></div>
