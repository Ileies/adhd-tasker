<script lang="ts">
	import { createTask, updateTask } from '$lib';
	import { Priority, type TaskForm } from '$lib/types';
	import { Edit, Plus } from 'lucide-svelte';

	const { email, form }: {email: string, form: TaskForm} = $props();

	async function handleSubmit(event: Event) {
		event.preventDefault();

		const startTime = Math.floor(form.startTime.getTime() / 1000);

		const taskData = {
			title: form.title,
			description: form.description,
			duration: form.duration,
			startTime,
			priority: form.priority,
			email
		};

		try {
			if (form.isEditing && form.selectedTask) {
				await updateTask({ ...form.selectedTask, ...taskData });
			} else {
				await createTask(taskData);
			}

			form.showTaskForm = false;
		} catch (error) {
			console.error('Failed to save task:', error);
		}
	}
</script>

{#if form.showTaskForm}
	<div class="modal modal-open">
		<div class="modal-box w-11/12 max-w-lg relative">
			<!-- Close button -->
			<button
				class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
				onclick={() => form.showTaskForm = false}
			>
				✕
			</button>

			<h3 class="font-bold text-xl mb-6">
				{form.isEditing ? 'Edit Task' : 'New Task'}
			</h3>

			<form onsubmit={handleSubmit} class="space-y-6">
				<!-- Title -->
				<div class="form-control w-full">
					<label class="label" for="title">
						<span class="label-text font-medium">Title *</span>
					</label>
					<input
						id="title"
						type="text"
						class="input input-bordered w-full"
						bind:value={form.title}
						placeholder="Enter task title..."
						required
					/>
				</div>

				<!-- Description -->
				<div class="form-control w-full">
					<label class="label" for="description">
						<span class="label-text font-medium">Description</span>
					</label>
					<textarea
						id="description"
						class="textarea textarea-bordered w-full resize-none"
						rows="3"
						bind:value={form.description}
						placeholder="Add a description (optional)..."
					></textarea>
				</div>

				<!-- Time and Duration Row -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="form-control w-full">
						<label class="label" for="startTime">
							<span class="label-text font-medium">Start Time *</span>
						</label>
						<input
							id="startTime"
							type="datetime-local"
							class="input input-bordered w-full"
							value={form.startTime.toISOString().slice(0, 16)}
							onchange={(e) => form.startTime = new Date(e.currentTarget.value)}
							required
						/>
					</div>

					<div class="form-control w-full">
						<label class="label" for="duration">
							<span class="label-text font-medium">Duration *</span>
						</label>
						<div class="relative">
							<input
								id="duration"
								type="number"
								class="input input-bordered w-full pr-16"
								min="5"
								max="1440"
								bind:value={form.duration}
								placeholder="60"
								required
							/>
							<span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-base-content/60">
								min
							</span>
						</div>
					</div>
				</div>

				<!-- Priority -->
				<div class="form-control w-full">
					<label class="label" for="priority">
						<span class="label-text font-medium">Priority</span>
					</label>
					<select
						id="priority"
						class="select select-bordered w-full"
						bind:value={form.priority}
					>
						<option value={Priority.Low}>🟢 Low</option>
						<option value={Priority.Medium}>🔵 Medium</option>
						<option value={Priority.High}>🟡 High</option>
						<option value={Priority.Urgent}>🟠 Urgent</option>
						<option value={Priority.Critical}>🔴 Critical</option>
					</select>
				</div>

				<!-- Quick Duration Buttons -->
				<div class="form-control w-full">
					<div class="label">
						<span class="label-text font-medium">Quick Duration</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn btn-sm btn-outline"
							onclick={() => form.duration = 15}
						>
							15m
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline"
							onclick={() => form.duration = 30}
						>
							30m
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline"
							onclick={() => form.duration = 60}
						>
							1h
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline"
							onclick={() => form.duration = 120}
						>
							2h
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline"
							onclick={() => form.duration = 240}
						>
							4h
						</button>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex justify-end gap-3 pt-4 border-t border-base-300">
					<button type="button" class="btn btn-ghost" onclick={() => form.showTaskForm = false}>
						Cancel
					</button>
					<button class="btn btn-primary gap-2">
						{#if form.isEditing}
							<Edit class="h-4 w-4" />
							Update Task
						{:else}
							<Plus class="h-4 w-4" />
							Create Task
						{/if}
					</button>
				</div>
			</form>
		</div>

		<button aria-label="Close Task Form" class="modal-backdrop" onclick={() => form.showTaskForm = false}></button>
	</div>
{/if}