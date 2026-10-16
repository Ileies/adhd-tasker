<script lang="ts" module>
	import type { Routine } from '#lib/core/repo.js';

	/** What the sheet shows: closed, the list, or one routine ('new' for a blank form). */
	export interface RoutinesView {
		open: boolean;
		editing: Routine | 'new' | null;
	}
</script>

<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { formatClock24, formatMinutes } from '#lib/format.js';
	import { SHIFT_CHIPS } from '#lib/placeday.js';
	import { addRoutine, changeRoutine, removeRoutine } from '#lib/routines.js';
	import {
		REPEAT_PRESETS,
		checkRoutineForm,
		newRoutineForm,
		routineChanges,
		routineFields,
		routineForm,
		routineLine,
		type RoutineForm
	} from '#lib/routineform.js';
	import { WEEK_ORDER, dayName, repeatFromDays, repeatText } from '#lib/schedule.js';
	import { DURATION_CHIPS, isChipDuration, joinHeard, parseClock } from '#lib/taskform.js';
	import { todayIn } from '#lib/time.js';
	import { Priority } from '#lib/types.js';
	import { priorityStyle } from '#lib/urgency.js';
	import { canTalk } from '#lib/speech.js';
	import { ChevronLeft, Plus, Trash2 } from '@lucide/svelte';
	import MicButton from '#lib/components/MicButton.svelte';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let { view = $bindable() }: { view: RoutinesView } = $props();

	const priorities = [
		Priority.Low,
		Priority.Medium,
		Priority.High,
		Priority.Urgent,
		Priority.Critical
	];

	let form = $state<RoutineForm>(newRoutineForm(todayIn(tasker.timezone)));
	let failure = $state('');
	let saving = $state(false);
	let freeDuration = $state(false);
	let endsOpen = $state(false);

	// The form starts over every time a routine (or a blank one) is opened
	$effect(() => {
		const editing = view.editing;
		if (editing === null) return;
		form = editing === 'new' ? newRoutineForm(todayIn(tasker.timezone)) : routineForm(editing);
		failure = '';
		saving = false;
		freeDuration = !isChipDuration(form.duration);
		endsOpen = form.lastDay !== null;
	});

	const editing = $derived(view.editing !== null && view.editing !== 'new' ? view.editing : null);
	const repeat = $derived(repeatFromDays(form.days));
	const toggleDay = (day: number) =>
		(form.days = form.days.includes(day)
			? form.days.filter((d) => d !== day)
			: [...form.days, day]);

	async function save(event: Event) {
		event.preventDefault();
		const wrong = checkRoutineForm(form);
		if (wrong) {
			failure = wrong;
			return;
		}
		saving = true;
		try {
			if (editing) {
				const changes = routineChanges(editing, form);
				// A change is saved at once for the days that follow, a toast names the Undo
				if (
					Object.keys(changes).length > 0 &&
					!(await changeRoutine({ id: editing.id, ...changes }, `Saved ${form.title.trim()}`))
				) {
					failure = tasker.toasts.at(-1)?.message ?? 'Could not save the routine';
					return;
				}
			} else {
				await addRoutine(routineFields(form));
			}
			view.editing = null;
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Could not save the routine';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!editing) return;
		if (await removeRoutine(editing)) view.editing = null;
	}

	const chip =
		'min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors md:min-h-8';
	const lit = 'bg-primary text-primary-foreground border-primary';
	const unlit = 'bg-background hover:bg-muted';
</script>

<Dialog.Root
	open={view.open}
	onOpenChange={(open) => {
		view.open = open;
		if (!open) view.editing = null;
	}}
>
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title class={view.editing === null ? '' : 'sr-only'}>
				{view.editing === null ? 'Routines' : editing ? 'Edit routine' : 'New routine'}
			</Dialog.Title>
			<Dialog.Description class={view.editing === null ? 'text-muted-foreground' : 'sr-only'}>
				{view.editing === null
					? 'Tasks that repeat. Each one is made for the next 14 days.'
					: 'Title, days, time, priority'}
			</Dialog.Description>
		</Dialog.Header>

		{#if view.editing === null}
			<ul class="divide-y rounded-lg border">
				{#each tasker.routines as routine (routine.id)}
					<li>
						<button
							type="button"
							class="hover:bg-muted flex min-h-14 w-full cursor-pointer flex-col items-start px-4 py-2 text-left"
							onclick={() => (view.editing = routine)}
						>
							<span class="font-medium">{routine.title}</span>
							<span class="text-muted-foreground text-sm">{routineLine(routine)}</span>
						</button>
					</li>
				{:else}
					<li class="text-muted-foreground px-4 py-3 text-sm">
						Nothing repeats yet. Add one here, or write "Lunch 12:00 45m daily" in the quick add
						line.
					</li>
				{/each}
			</ul>
			<Dialog.Footer>
				<Button type="button" onclick={() => (view.editing = 'new')}>
					<Plus />
					New routine
				</Button>
			</Dialog.Footer>
		{:else}
			<form onsubmit={save} class="space-y-5">
				<Button
					variant="ghost"
					size="sm"
					type="button"
					class="text-muted-foreground -ml-2"
					onclick={() => (view.editing = null)}
				>
					<ChevronLeft />
					Routines
				</Button>

				<div class="relative">
					<Input
						type="text"
						class="h-12 text-xl md:text-xl {canTalk() ? 'pr-12' : ''}"
						bind:value={form.title}
						placeholder="What repeats? (required)"
						aria-label="Title"
						required
					/>
					<MicButton
						class="absolute top-1/2 right-1 -translate-y-1/2"
						onheard={(text) => (form.title = joinHeard(form.title, text))}
					/>
				</div>

				<div class="space-y-2">
					<div class="flex flex-wrap gap-2" role="group" aria-label="Repeat">
						{#each REPEAT_PRESETS as preset (preset.text)}
							<button
								type="button"
								class="{chip} {repeatFromDays(preset.days) === repeat ? lit : unlit}"
								aria-pressed={repeatFromDays(preset.days) === repeat}
								onclick={() => (form.days = preset.days)}>{preset.text}</button
							>
						{/each}
					</div>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Days">
						{#each WEEK_ORDER as day (day)}
							<button
								type="button"
								class="{chip} {form.days.includes(day) ? lit : unlit}"
								aria-pressed={form.days.includes(day)}
								aria-label={dayName(day)}
								onclick={() => toggleDay(day)}>{dayName(day, true)}</button
							>
						{/each}
					</div>
					<p class="text-muted-foreground text-sm">
						{form.days.length === 0 ? 'Pick at least one day' : repeatText(repeat)}
					</p>
				</div>

				<div class="grid gap-2">
					<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Kind">
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
				</div>

				{#if form.kind === 'block'}
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
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="routine-priority-label">Priority</span>
					<div class="flex gap-1" role="radiogroup" aria-labelledby="routine-priority-label">
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

				{#if endsOpen}
					<label class="flex flex-wrap items-center gap-2 text-sm">
						<span class="text-muted-foreground">Last day</span>
						<Input
							type="date"
							class="h-11 w-auto md:h-8"
							value={form.lastDay ?? ''}
							onchange={(event) => (form.lastDay = event.currentTarget.value || null)}
							aria-label="Last day"
						/>
					</label>
				{:else}
					<Button variant="ghost" size="sm" type="button" onclick={() => (endsOpen = true)}>
						<Plus />
						Stop it on a day
					</Button>
				{/if}

				{#if editing}
					<p class="text-muted-foreground text-sm">
						A change reaches the days from today on. A day you changed or finished keeps what it
						has.
					</p>
				{/if}

				{#if failure}
					<p class="text-destructive text-sm" role="alert">{failure}</p>
				{/if}

				<Dialog.Footer>
					{#if editing}
						<Button
							variant="ghost"
							type="button"
							class="text-muted-foreground sm:mr-auto"
							onclick={remove}
						>
							<Trash2 />
							Remove
						</Button>
					{/if}
					<Button type="submit" disabled={saving}>{editing ? 'Save' : 'Add'}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
