<script lang="ts">
	import { createTask, errorText, showToast, updateTask } from '#lib';
	import { tasker } from '#lib/app.svelte.js';
	import { Priority, TaskStatus, type Task, type TaskForm } from '#lib/types.js';
	import { formatClock24, formatMinutes } from '#lib/format.js';
	import { SHIFT_CHIPS } from '#lib/placeday.js';
	import { todayIn, addDays } from '#lib/time.js';
	import {
		DURATION_CHIPS,
		dateChoice,
		endLine,
		isChipDuration,
		joinHeard,
		parseClock
	} from '#lib/taskform.js';
	import { needsPrep } from '#lib/prep.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { Check, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from '@lucide/svelte';
	import MicButton from '#lib/components/MicButton.svelte';
	import { canTalk } from '#lib/speech.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	const { form = $bindable(), onDelete }: { form: TaskForm; onDelete?: (task: Task) => void } =
		$props();

	const priorities = [
		Priority.Low,
		Priority.Medium,
		Priority.High,
		Priority.Urgent,
		Priority.Critical
	];

	// The reason a save failed, shown above the buttons because the eye is in the dialog
	let failure = $state('');
	let today = $state(todayIn(tasker.timezone));
	// The extra fields stay folded until they are asked for or already hold something
	let pickingDate = $state(false);
	let freeDuration = $state(false);
	let noteOpen = $state(false);

	$effect(() => {
		if (!form.showTaskForm) return;
		failure = '';
		today = todayIn(tasker.timezone);
		pickingDate = false;
		freeDuration = !isChipDuration(form.duration);
		noteOpen = form.description.trim() !== '';
	});

	const choice = $derived(dateChoice(form.date, today));
	const end = $derived(endLine(form.startTime, form.duration));
	const done = $derived(form.selectedTask?.status === TaskStatus.Completed);
	/** An appointment nobody prepares for yet offers the sheet again. */
	const offerPrep = $derived(
		form.isEditing && form.selectedTask ? needsPrep(form.selectedTask, tasker.todos, today) : false
	);

	function openPrep() {
		const appointment = form.selectedTask;
		if (!appointment) return;
		form.showTaskForm = false;
		tasker.prep.appointment = appointment;
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		failure = '';

		const taskData = {
			title: form.title.trim(),
			description: form.description,
			date: form.date,
			duration: form.duration,
			startTime: form.startTime,
			priority: form.priority,
			kind: form.kind,
			// Only a task of the user's own moves, an appointment keeps what it had
			shift: form.kind === 'block' ? form.shift : 0
		};

		if (!taskData.title) {
			failure = 'Give the task a title';
			return;
		}
		if (end.over) {
			failure = end.text;
			return;
		}

		try {
			if (form.isEditing && form.selectedTask) {
				// A refused change shows its toast and leaves the dialog open
				if (!(await updateTask({ ...form.selectedTask, ...taskData }))) {
					failure = tasker.toasts.at(-1)?.message ?? 'Could not save the task';
					return;
				}
			} else {
				const created = await createTask(taskData);
				// An appointment asks how to get there and what to prepare
				if (created.kind === 'appointment') tasker.prep.appointment = created;
			}

			form.showTaskForm = false;
		} catch (error) {
			failure = errorText(error, 'Could not save the task');
			showToast(failure);
		}
	}

	/** Done or Reopen from the sheet, with an Undo like everywhere else. */
	async function toggleDone() {
		const task = form.selectedTask;
		if (!task) return;
		const before = task.status;
		const status = done ? TaskStatus.Pending : TaskStatus.Completed;
		form.showTaskForm = false;
		await updateTask({ ...task, status });
		showToast(
			status === TaskStatus.Completed ? `Done: ${task.title}` : `Reopened: ${task.title}`,
			() => updateTask({ ...task, status: before })
		);
	}

	const chip =
		'min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors md:min-h-8';
	const lit = 'bg-primary text-primary-foreground border-primary';
	const unlit = 'bg-background hover:bg-muted';
</script>

<Dialog.Root bind:open={form.showTaskForm}>
	<!-- A centered dialog on wide screens, a sheet from the bottom on phones -->
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title class="sr-only">{form.isEditing ? 'Edit task' : 'New task'}</Dialog.Title>
			<Dialog.Description class="sr-only">Title, time, priority and a note</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-5">
			<div class="relative">
				<Input
					type="text"
					class="h-12 text-xl md:text-xl {canTalk() ? 'pr-12' : ''}"
					bind:value={form.title}
					placeholder="What needs doing? (required)"
					aria-label="Title"
					required
				/>
				<MicButton
					class="absolute top-1/2 right-1 -translate-y-1/2"
					onheard={(text) => (form.title = joinHeard(form.title, text))}
				/>
			</div>

			<div class="flex flex-wrap gap-2" role="group" aria-label="Day">
				<button
					type="button"
					class="{chip} {choice === 'today' && !pickingDate ? lit : unlit}"
					aria-pressed={choice === 'today' && !pickingDate}
					onclick={() => {
						form.date = today;
						pickingDate = false;
					}}>Today</button
				>
				<button
					type="button"
					class="{chip} {choice === 'tomorrow' && !pickingDate ? lit : unlit}"
					aria-pressed={choice === 'tomorrow' && !pickingDate}
					onclick={() => {
						form.date = addDays(today, 1);
						pickingDate = false;
					}}>Tomorrow</button
				>
				<button
					type="button"
					class="{chip} {choice === 'other' || pickingDate ? lit : unlit}"
					aria-pressed={choice === 'other' || pickingDate}
					onclick={() => (pickingDate = true)}>Pick date</button
				>
				{#if choice === 'other' || pickingDate}
					<div class="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="icon"
							class="size-11 shrink-0 md:size-8"
							aria-label="Day before"
							onclick={() => (form.date = addDays(form.date, -1))}><ChevronLeft /></Button
						>
						<Input
							type="date"
							class="h-11 w-auto md:h-8"
							bind:value={form.date}
							aria-label="Date"
							required
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							class="size-11 shrink-0 md:size-8"
							aria-label="Day after"
							onclick={() => (form.date = addDays(form.date, 1))}><ChevronRight /></Button
						>
					</div>
				{/if}
			</div>

			{#if form.kind !== 'travel'}
				<div class="grid gap-2">
					<div class="flex flex-wrap gap-2" role="group" aria-label="Kind">
						<button
							type="button"
							class="{chip} {form.kind === 'block' ? lit : unlit}"
							aria-pressed={form.kind === 'block'}
							onclick={() => (form.kind = 'block')}>Task at a time</button
						>
						<button
							type="button"
							class="{chip} {form.kind === 'appointment' ? lit : unlit}"
							aria-pressed={form.kind === 'appointment'}
							onclick={() => (form.kind = 'appointment')}>Appointment</button
						>
					</div>
					<p class="text-muted-foreground text-sm">
						{form.kind === 'appointment'
							? "Somebody else's time. It ends on its own and nobody asks whether you did it."
							: 'Your own time. You are asked when it runs out.'}
					</p>
				</div>
			{/if}

			{#if form.kind === 'block'}
				<div class="grid gap-2">
					<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Can move by">
						<span class="text-muted-foreground text-sm">Can move by</span>
						{#each SHIFT_CHIPS as minutes (minutes)}
							<button
								type="button"
								class="{chip} {form.shift === minutes ? lit : unlit}"
								aria-pressed={form.shift === minutes}
								onclick={() => (form.shift = minutes)}
							>
								{minutes === 0 ? 'Stays' : formatMinutes(minutes)}
							</button>
						{/each}
					</div>
					{#if form.shift > 0}
						<p class="text-muted-foreground text-sm">
							It makes room for appointments and travel when they clash, within this time. The time
							you set here never changes.
						</p>
					{/if}
				</div>
			{/if}

			<div class="grid gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<label class="flex items-center gap-2 text-sm">
						<span class="text-muted-foreground">Start</span>
						<TimeInput
							label="Start"
							value={formatClock24(form.startTime)}
							onchange={(value) => {
								const minutes = parseClock(value);
								if (minutes !== null) form.startTime = minutes;
							}}
							required
						/>
					</label>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Duration">
						{#each DURATION_CHIPS as minutes (minutes)}
							<button
								type="button"
								class="{chip} {form.duration === minutes && !freeDuration ? lit : unlit}"
								aria-pressed={form.duration === minutes && !freeDuration}
								onclick={() => {
									form.duration = minutes;
									freeDuration = false;
								}}>{minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}</button
							>
						{/each}
						<button
							type="button"
							class="{chip} {freeDuration ? lit : unlit}"
							aria-pressed={freeDuration}
							aria-label="Other duration"
							onclick={() => (freeDuration = true)}>..</button
						>
					</div>
				</div>
				{#if freeDuration}
					<div class="flex items-center gap-2">
						<NumberInput
							bind:value={form.duration}
							label="Duration in minutes"
							min={5}
							max={1440}
							step={5}
						/>
						<span class="text-muted-foreground text-sm">min</span>
					</div>
				{/if}
				<p class="text-sm {end.over ? 'text-destructive' : 'text-muted-foreground'}">{end.text}</p>
			</div>

			<div class="grid gap-2">
				<span class="text-sm" id="priority-label">Priority</span>
				<div class="flex gap-1" role="radiogroup" aria-labelledby="priority-label">
					{#each priorities as priority (priority)}
						{@const style = priorityStyle[priority]}
						<button
							type="button"
							role="radio"
							aria-checked={form.priority === priority}
							class="min-h-11 flex-1 cursor-pointer rounded-md border px-1 text-sm transition-colors md:min-h-9 {form.priority ===
							priority
								? `${style.block} font-semibold`
								: style.chip}"
							onclick={() => (form.priority = priority)}>{style.label}</button
						>
					{/each}
				</div>
			</div>

			{#if noteOpen}
				<div class="relative">
					<Textarea
						class="resize-none {canTalk() ? 'pr-12' : ''}"
						rows={3}
						bind:value={form.description}
						placeholder="Note"
						aria-label="Note"
					/>
					<MicButton
						class="absolute top-1 right-1"
						onheard={(text) => (form.description = joinHeard(form.description, text))}
					/>
				</div>
			{:else}
				<Button variant="ghost" size="sm" type="button" onclick={() => (noteOpen = true)}>
					<Plus />
					Add a note
				</Button>
			{/if}

			{#if offerPrep}
				<Button variant="ghost" size="sm" type="button" onclick={openPrep}>
					<Plus />
					Prepare for it
				</Button>
			{/if}

			{#if failure}
				<p class="text-destructive text-sm" role="alert">{failure}</p>
			{/if}

			<Dialog.Footer>
				{#if form.isEditing && form.selectedTask}
					{#if onDelete}
						{@const task = form.selectedTask}
						<Button
							variant="ghost"
							type="button"
							class="text-muted-foreground sm:mr-auto"
							onclick={() => {
								form.showTaskForm = false;
								onDelete(task);
							}}
						>
							<Trash2 />
							Delete
						</Button>
					{/if}
					<Button variant="outline" type="button" onclick={toggleDone}>
						{#if done}
							<RotateCcw />
							Reopen
						{:else}
							<Check />
							Done
						{/if}
					</Button>
				{/if}
				<Button type="submit">{form.isEditing ? 'Save' : 'Add'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
