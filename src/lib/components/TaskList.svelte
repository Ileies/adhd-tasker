<script lang="ts">
	import { TaskStatus, type Task } from '#lib/types.js';
	import { formatClock, formatDuration } from '#lib/format.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { tasker } from '#lib/app.svelte.js';
	import { deleteTask, updateTask } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Check, EllipsisVertical, ClipboardList, Trash2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	// Sort tasks by start time
	const sortedTasks = $derived([...tasker.tasks].sort((a, b) => a.startTime - b.startTime));

	// Group tasks by status
	const pendingTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Pending));
	const activeTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Active));
	const completedTasks = $derived(sortedTasks.filter(task => task.status === TaskStatus.Completed));
</script>

{#snippet taskRow(task: Task, actions: Snippet, rowClass = '')}
	<div class="flex items-center gap-3 rounded-lg border bg-card p-3 {rowClass}">
		<div class="min-w-0 flex-1">
			<h4 class="font-semibold">{task.title}</h4>
			{#if task.description}
				<p class="text-sm text-muted-foreground">{task.description}</p>
			{/if}
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<Badge class={priorityStyle[task.priority].chip}>{priorityStyle[task.priority].label}</Badge>
				<span class="tabular text-xs">{formatClock(task.startTime)}</span>
				<span class="text-xs text-muted-foreground">Duration: {formatDuration(task.duration)}</span>
			</div>
		</div>
		<div class="flex-none">{@render actions()}</div>
	</div>
{/snippet}

<div class="space-y-6">
	<!-- Active Tasks -->
	{#if activeTasks.length > 0}
		<Card.Root class="bg-primary/10 ring-primary/30">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-primary">
					<Badge>Active</Badge>
					Active Tasks
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#each activeTasks as task (task.id)}
					{#snippet actions()}
						<Button
							class="bg-success text-success-foreground hover:bg-success/80"
							onclick={() => updateTask({ ...task, status: TaskStatus.Completed })}
						>
							<Check />
							Complete
						</Button>
					{/snippet}
					{@render taskRow(task, actions, 'border-primary/40')}
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Pending Tasks -->
	{#if pendingTasks.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Badge variant="secondary">Pending</Badge>
					Upcoming Tasks
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#each pendingTasks as task (task.id)}
					{#snippet actions()}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon" aria-label="Task actions">
										<EllipsisVertical />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-48">
								<DropdownMenu.Item onSelect={() => updateTask({ ...task, status: TaskStatus.Completed })}>
									<Check class="text-success" />
									Mark Complete
								</DropdownMenu.Item>
								<DropdownMenu.Item variant="destructive" onSelect={() => deleteTask(task)}>
									<Trash2 />
									Delete
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/snippet}
					{@render taskRow(task, actions)}
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Completed Tasks -->
	{#if completedTasks.length > 0}
		<Card.Root class="bg-success/10 ring-success/30">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-success">
					<Badge class="bg-success text-success-foreground">Completed</Badge>
					Completed Tasks
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#each completedTasks.slice(-5) as task (task.id)}
					{#snippet actions()}
						<Button variant="destructive" size="sm" onclick={() => deleteTask(task)}>
							<Trash2 />
							Delete
						</Button>
					{/snippet}
					{@render taskRow(task, actions, 'border-success/40')}
				{/each}
				{#if completedTasks.length > 5}
					<p class="text-center text-sm text-muted-foreground">
						... and {completedTasks.length - 5} more completed tasks
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Empty State -->
	{#if tasker.tasks.length === 0}
		<Card.Root>
			<Card.Content class="flex flex-col items-center gap-3 text-center">
				<ClipboardList class="size-16 opacity-25" />
				<h3 class="text-lg font-semibold">No Tasks Yet</h3>
				<p class="text-muted-foreground">Create your first task to get started with your ADHD management journey!</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
