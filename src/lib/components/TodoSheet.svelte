<script lang="ts">
	import { Check, ChevronLeft, ChevronRight, Trash2 } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import type { Todo } from '#lib/core/repo.js';
	import { formatClock24, formatDuration } from '#lib/format.js';
	import { dateChoice, joinHeard, parseClock } from '#lib/taskform.js';
	import { SIZE_CHIPS, todoFormOf, todoPatchOf, type TodoForm } from '#lib/todoform.js';
	import { addDays, todayIn } from '#lib/time.js';
	import { changeTodo, dropTodo, finishTodo } from '#lib/todos.js';
	import { Priority } from '#lib/types.js';
	import { priorityStyle } from '#lib/urgency.js';
	import MicButton from '#lib/components/MicButton.svelte';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { canTalk } from '#lib/speech.js';

	/** The to-do being edited, `null` while the sheet is closed. */
	let { todo = $bindable(null) }: { todo: Todo | null } = $props();

	const priorities = [
		Priority.Low,
		Priority.Medium,
		Priority.High,
		Priority.Urgent,
		Priority.Critical
	];

	let form = $state<TodoForm | null>(null);
	let failure = $state('');
	let today = $state(todayIn(tasker.timezone));
	let pickingDate = $state(false);
	let freeSize = $state(false);

	// A to-do opens the sheet with its own values, closing it forgets them
	$effect(() => {
		if (!todo) {
			form = null;
			return;
		}
		const opened = todoFormOf(todo);
		form = opened;
		failure = '';
		today = todayIn(tasker.timezone);
		pickingDate = false;
		freeSize = opened.estimate !== null && !SIZE_CHIPS.includes(opened.estimate);
	});

	const open = $derived(todo !== null);
	const choice = $derived(form && form.dueDate !== '' ? dateChoice(form.dueDate, today) : null);

	async function save(event: Event) {
		event.preventDefault();
		if (!todo || !form) return;
		const made = todoPatchOf(form);
		if (!made.ok) {
			failure = made.error;
			return;
		}
		if (await changeTodo({ ...made.patch, id: todo.id })) todo = null;
		else failure = tasker.toasts.at(-1)?.message ?? 'Could not save the to-do';
	}

	function finish() {
		const current = todo;
		todo = null;
		if (current) finishTodo(current);
	}

	function drop() {
		const current = todo;
		todo = null;
		if (current) dropTodo(current);
	}

	const chip =
		'min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors md:min-h-8';
	const lit = 'bg-primary text-primary-foreground border-primary';
	const unlit = 'bg-background hover:bg-muted';
</script>

<Dialog.Root {open} onOpenChange={(value) => !value && (todo = null)}>
	<!-- A centered dialog on wide screens, a sheet from the bottom on phones -->
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title class="sr-only">Edit to-do</Dialog.Title>
			<Dialog.Description class="sr-only"
				>Title, size, due date, priority, next step and progress</Dialog.Description
			>
		</Dialog.Header>

		{#if form}
			<form onsubmit={save} class="space-y-5">
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
						onheard={(text) => form && (form.title = joinHeard(form.title, text))}
					/>
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="size-label">How long will it take in all?</span>
					<div class="flex flex-wrap gap-2" role="group" aria-labelledby="size-label">
						<button
							type="button"
							class="{chip} {form.estimate === null ? lit : unlit}"
							aria-pressed={form.estimate === null}
							onclick={() => {
								if (form) form.estimate = null;
								freeSize = false;
							}}>Not sure</button
						>
						{#each SIZE_CHIPS as minutes (minutes)}
							<button
								type="button"
								class="{chip} {form.estimate === minutes && !freeSize ? lit : unlit}"
								aria-pressed={form.estimate === minutes && !freeSize}
								onclick={() => {
									if (form) form.estimate = minutes;
									freeSize = false;
								}}>{formatDuration(minutes)}</button
							>
						{/each}
						<button
							type="button"
							class="{chip} {freeSize ? lit : unlit}"
							aria-pressed={freeSize}
							aria-label="Other size"
							onclick={() => {
								freeSize = true;
								if (form && form.estimate === null) form.estimate = 60;
							}}>..</button
						>
					</div>
					{#if freeSize && form.estimate !== null}
						<div class="flex items-center gap-2">
							<NumberInput
								bind:value={form.estimate}
								label="Size in minutes"
								min={5}
								max={30000}
								step={15}
							/>
							<span class="text-muted-foreground text-sm">min</span>
						</div>
					{/if}
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="due-label">Due</span>
					<div class="flex flex-wrap gap-2" role="group" aria-labelledby="due-label">
						<button
							type="button"
							class="{chip} {form.dueDate === '' && !pickingDate ? lit : unlit}"
							aria-pressed={form.dueDate === '' && !pickingDate}
							onclick={() => {
								if (form) form.dueDate = '';
								pickingDate = false;
							}}>No date</button
						>
						<button
							type="button"
							class="{chip} {choice === 'today' && !pickingDate ? lit : unlit}"
							aria-pressed={choice === 'today' && !pickingDate}
							onclick={() => {
								if (form) form.dueDate = today;
								pickingDate = false;
							}}>Today</button
						>
						<button
							type="button"
							class="{chip} {choice === 'tomorrow' && !pickingDate ? lit : unlit}"
							aria-pressed={choice === 'tomorrow' && !pickingDate}
							onclick={() => {
								if (form) form.dueDate = addDays(today, 1);
								pickingDate = false;
							}}>Tomorrow</button
						>
						<button
							type="button"
							class="{chip} {choice === 'other' || pickingDate ? lit : unlit}"
							aria-pressed={choice === 'other' || pickingDate}
							onclick={() => {
								pickingDate = true;
								if (form && form.dueDate === '') form.dueDate = addDays(today, 7);
							}}>Pick date</button
						>
					</div>
					{#if form.dueDate !== '' && (choice === 'other' || pickingDate)}
						<div class="flex items-center gap-1">
							<Button
								type="button"
								variant="outline"
								size="icon"
								class="size-11 shrink-0 md:size-8"
								aria-label="Day before"
								onclick={() => form && (form.dueDate = addDays(form.dueDate, -1))}
								><ChevronLeft /></Button
							>
							<Input
								type="date"
								class="h-11 w-auto md:h-8"
								bind:value={form.dueDate}
								aria-label="Due date"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								class="size-11 shrink-0 md:size-8"
								aria-label="Day after"
								onclick={() => form && (form.dueDate = addDays(form.dueDate, 1))}
								><ChevronRight /></Button
							>
						</div>
					{/if}
					{#if form.dueDate !== ''}
						<label class="flex items-center gap-2 text-sm">
							<span class="text-muted-foreground">By</span>
							<TimeInput
								label="Due time"
								value={formatClock24(form.dueTime ?? tasker.settings.myDayEnd - 1)}
								onchange={(value) => {
									const minutes = parseClock(value);
									if (form && minutes !== null) form.dueTime = minutes;
								}}
							/>
							{#if form.dueTime !== null}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => form && (form.dueTime = null)}>End of day</Button
								>
							{/if}
						</label>
					{/if}
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="todo-priority-label">Priority</span>
					<div class="flex gap-1" role="radiogroup" aria-labelledby="todo-priority-label">
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
								onclick={() => form && (form.priority = priority)}>{style.label}</button
							>
						{/each}
					</div>
				</div>

				<div class="relative">
					<Input
						type="text"
						class={canTalk() ? 'pr-12' : ''}
						bind:value={form.nextStep}
						placeholder="Next step: the first small thing to do"
						aria-label="Next step"
						maxlength={200}
					/>
					<MicButton
						class="absolute top-1/2 right-1 -translate-y-1/2"
						onheard={(text) => form && (form.nextStep = joinHeard(form.nextStep, text))}
					/>
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="progress-label">How far is it? {form.progress} %</span>
					<Slider
						type="single"
						min={0}
						max={100}
						step={5}
						bind:value={form.progress}
						aria-labelledby="progress-label"
					/>
				</div>

				<Textarea
					class="resize-none"
					rows={2}
					bind:value={form.description}
					placeholder="Note"
					aria-label="Note"
				/>

				{#if failure}
					<p class="text-destructive text-sm" role="alert">{failure}</p>
				{/if}

				<Dialog.Footer>
					<Button
						variant="ghost"
						type="button"
						class="text-muted-foreground sm:mr-auto"
						onclick={drop}
					>
						<Trash2 />
						Drop
					</Button>
					<Button variant="outline" type="button" onclick={finish}>
						<Check />
						Done
					</Button>
					<Button type="submit">Save</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
