<script lang="ts">
	import { createTask, errorText, showToast, updateTask } from '#lib';
	import { tasker } from '#lib/app.svelte.js';
	import { Priority, type Task, type TaskForm } from '#lib/types.js';
	import { Edit, Plus, Trash2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';

	const { form = $bindable(), onDelete }: { form: TaskForm; onDelete?: (task: Task) => void } =
		$props();

	const priorityOptions = [
		{ value: Priority.Low, label: 'Low' },
		{ value: Priority.Medium, label: 'Medium' },
		{ value: Priority.High, label: 'High' },
		{ value: Priority.Urgent, label: 'Urgent' },
		{ value: Priority.Critical, label: 'Critical' }
	];

	const quickDurations = [
		{ label: '15m', minutes: 15 },
		{ label: '30m', minutes: 30 },
		{ label: '1h', minutes: 60 },
		{ label: '2h', minutes: 120 },
		{ label: '4h', minutes: 240 }
	];

	const priorityLabel = $derived(
		priorityOptions.find((o) => o.value === form.priority)?.label ?? 'Select priority'
	);

	// The reason a save failed, shown above the buttons because the eye is in the dialog
	let failure = $state('');

	$effect(() => {
		if (form.showTaskForm) failure = '';
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		failure = '';

		const taskData = {
			title: form.title,
			description: form.description,
			date: form.date,
			duration: form.duration,
			startTime: form.startTime,
			priority: form.priority
		};

		try {
			if (form.isEditing && form.selectedTask) {
				// A refused change shows its toast and leaves the dialog open
				if (!(await updateTask({ ...form.selectedTask, ...taskData }))) {
					failure = tasker.toast?.message ?? 'Could not save the task';
					return;
				}
			} else {
				await createTask(taskData);
			}

			form.showTaskForm = false;
		} catch (error) {
			failure = errorText(error, 'Could not save the task');
			showToast(failure);
		}
	}
</script>

<Dialog.Root bind:open={form.showTaskForm}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-xl">{form.isEditing ? 'Edit Task' : 'New Task'}</Dialog.Title>
			<Dialog.Description class="sr-only">Fill in the task details and save</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-5">
			<div class="grid gap-2">
				<Label for="title">Title *</Label>
				<Input
					id="title"
					type="text"
					bind:value={form.title}
					placeholder="Enter task title..."
					required
				/>
			</div>

			<div class="grid gap-2">
				<Label for="description">Description</Label>
				<Textarea
					id="description"
					class="resize-none"
					rows={3}
					bind:value={form.description}
					placeholder="Add a description (optional)..."
				/>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div class="grid gap-2">
					<Label for="date">Date *</Label>
					<Input id="date" type="date" bind:value={form.date} required />
				</div>

				<div class="grid gap-2">
					<Label for="startTime">Start Time *</Label>
					<Input
						id="startTime"
						type="time"
						value={Math.floor(form.startTime / 60)
							.toString()
							.padStart(2, '0') +
							':' +
							(form.startTime % 60).toString().padStart(2, '0')}
						onchange={(e) =>
							(form.startTime =
								parseInt(e.currentTarget.value.split(':')[0], 10) * 60 +
								parseInt(e.currentTarget.value.split(':')[1], 10))}
						required
					/>
				</div>

				<div class="grid gap-2">
					<Label for="duration">Duration *</Label>
					<div class="relative">
						<Input
							id="duration"
							type="number"
							class="pr-12"
							min={5}
							max={1440}
							bind:value={form.duration}
							placeholder="60"
							required
						/>
						<span
							class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
						>
							min
						</span>
					</div>
				</div>
			</div>

			<div class="grid gap-2">
				<Label for="priority">Priority</Label>
				<Select.Root
					type="single"
					value={String(form.priority)}
					onValueChange={(v) => (form.priority = Number(v) as Priority)}
				>
					<Select.Trigger id="priority" class="w-full">{priorityLabel}</Select.Trigger>
					<Select.Content>
						{#each priorityOptions as option (option.value)}
							<Select.Item value={String(option.value)} label={option.label}
								>{option.label}</Select.Item
							>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="grid gap-2">
				<Label>Quick duration</Label>
				<div class="flex flex-wrap gap-2">
					{#each quickDurations as quick (quick.minutes)}
						<Button
							variant={form.duration === quick.minutes ? 'default' : 'outline'}
							size="sm"
							onclick={() => (form.duration = quick.minutes)}
						>
							{quick.label}
						</Button>
					{/each}
				</div>
			</div>

			{#if failure}
				<p class="text-destructive text-sm" role="alert">{failure}</p>
			{/if}

			<Dialog.Footer>
				{#if form.isEditing && form.selectedTask && onDelete}
					{@const task = form.selectedTask}
					<Button
						variant="ghost"
						class="text-destructive sm:mr-auto"
						onclick={() => {
							form.showTaskForm = false;
							onDelete(task);
						}}
					>
						<Trash2 />
						Delete
					</Button>
				{/if}
				<Button variant="ghost" onclick={() => (form.showTaskForm = false)}>Cancel</Button>
				<Button type="submit">
					{#if form.isEditing}
						<Edit />
						Update Task
					{:else}
						<Plus />
						Create Task
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
