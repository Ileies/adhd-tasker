<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { formatClock, formatMinutes } from '#lib/format.js';
	import { PREPARE_CHIPS, TRAVEL_CHIPS, prepPlan, type PrepForm } from '#lib/prep.js';
	import { addPreparation, suggestSteps } from '#lib/prepare.js';
	import { formatDay, todayIn } from '#lib/time.js';
	import NumberInput from '#lib/components/NumberInput.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const appointment = $derived(tasker.prep.appointment);

	let form = $state<PrepForm>({ travel: null, prepare: null, steps: [] });
	let freeTravel = $state(false);
	let freePrepare = $state(false);
	let busy = $state(false);
	let suggesting = $state(false);

	// Every appointment opens the sheet empty, closing it forgets what was typed
	$effect(() => {
		if (!appointment) return;
		form = { travel: null, prepare: null, steps: [] };
		freeTravel = false;
		freePrepare = false;
		busy = false;
		suggesting = false;
	});

	const plan = $derived(
		appointment ? prepPlan(appointment, form, tasker.settings.arriveEarlyMinutes) : null
	);
	const travelLine = $derived(
		plan?.travel
			? `Ends ${tasker.settings.arriveEarlyMinutes} min before it starts: ${formatClock(plan.travel.startTime)} to ${formatClock(plan.travel.startTime + plan.travel.duration)}`
			: null
	);
	const empty = $derived(!plan || (!plan.travel && plan.todos.length === 0));
	const today = $derived(todayIn(tasker.timezone));

	function close() {
		tasker.prep.appointment = null;
	}

	// The suggestions only fill the list, the user reads, edits and removes them before Add writes anything
	async function suggest() {
		if (!appointment || suggesting) return;
		const asked = appointment;
		suggesting = true;
		const steps = await suggestSteps(asked);
		suggesting = false;
		// The sheet may have been closed or opened for another appointment while the assistant thought
		if (!steps || tasker.prep.appointment?.id !== asked.id) return;
		form.steps = [...form.steps.filter((step) => step.title.trim() !== ''), ...steps];
	}

	async function add() {
		if (!appointment || busy) return;
		busy = true;
		await addPreparation(appointment, form);
		close();
	}

	const chip =
		'min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors md:min-h-8';
	const lit = 'bg-primary text-primary-foreground border-primary';
	const unlit = 'bg-background hover:bg-muted';
	const hours = formatMinutes;
</script>

<Dialog.Root open={appointment !== null} onOpenChange={(value) => !value && close()}>
	<!-- A centered dialog on wide screens, a sheet from the bottom on phones -->
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title class="text-xl">{appointment?.title ?? 'Appointment'}</Dialog.Title>
			<Dialog.Description>
				{#if appointment}
					{formatDay(appointment.date, today)}, {formatClock(appointment.startTime)}.
				{/if}
				How do you get there, and what has to be ready?
			</Dialog.Description>
		</Dialog.Header>

		{#if appointment}
			<div class="space-y-5">
				<div class="grid gap-2">
					<span class="text-sm" id="travel-label">Getting there</span>
					<div class="flex flex-wrap gap-2" role="group" aria-labelledby="travel-label">
						<button
							type="button"
							class="{chip} {form.travel === null ? lit : unlit}"
							aria-pressed={form.travel === null}
							onclick={() => {
								form.travel = null;
								freeTravel = false;
							}}>No travel</button
						>
						{#each TRAVEL_CHIPS as minutes (minutes)}
							<button
								type="button"
								class="{chip} {form.travel === minutes && !freeTravel ? lit : unlit}"
								aria-pressed={form.travel === minutes && !freeTravel}
								onclick={() => {
									form.travel = minutes;
									freeTravel = false;
								}}>{hours(minutes)}</button
							>
						{/each}
						<button
							type="button"
							class="{chip} {freeTravel ? lit : unlit}"
							aria-pressed={freeTravel}
							aria-label="Other travel time"
							onclick={() => {
								freeTravel = true;
								if (form.travel === null) form.travel = 20;
							}}>..</button
						>
					</div>
					{#if freeTravel && form.travel !== null}
						<div class="flex items-center gap-2">
							<NumberInput
								bind:value={form.travel}
								label="Travel time in minutes"
								min={5}
								max={720}
								step={5}
							/>
							<span class="text-muted-foreground text-sm">min</span>
						</div>
					{/if}
					{#if plan?.problem}
						<p class="text-destructive text-sm" role="alert">{plan.problem}</p>
					{:else if travelLine}
						<p class="text-muted-foreground text-sm">{travelLine}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<span class="text-sm" id="prepare-label">Prepare</span>
					<div class="flex flex-wrap gap-2" role="group" aria-labelledby="prepare-label">
						<button
							type="button"
							class="{chip} {form.prepare === null ? lit : unlit}"
							aria-pressed={form.prepare === null}
							onclick={() => {
								form.prepare = null;
								freePrepare = false;
							}}>Nothing</button
						>
						{#each PREPARE_CHIPS as minutes (minutes)}
							<button
								type="button"
								class="{chip} {form.prepare === minutes && !freePrepare ? lit : unlit}"
								aria-pressed={form.prepare === minutes && !freePrepare}
								onclick={() => {
									form.prepare = minutes;
									freePrepare = false;
								}}>{hours(minutes)}</button
							>
						{/each}
						<button
							type="button"
							class="{chip} {freePrepare ? lit : unlit}"
							aria-pressed={freePrepare}
							aria-label="Other preparation time"
							onclick={() => {
								freePrepare = true;
								if (form.prepare === null) form.prepare = 60;
							}}>..</button
						>
					</div>
					{#if freePrepare && form.prepare !== null}
						<div class="flex items-center gap-2">
							<NumberInput
								bind:value={form.prepare}
								label="Preparation time in minutes"
								min={5}
								max={30000}
								step={15}
							/>
							<span class="text-muted-foreground text-sm">min</span>
						</div>
					{/if}
					{#if form.prepare !== null}
						<p class="text-muted-foreground text-sm">
							It becomes a to-do that finds its own time before the appointment.
						</p>
					{/if}
				</div>

				{#each form.steps as step, index (index)}
					<div class="flex items-center gap-2">
						<Input
							type="text"
							class="min-w-0 flex-1"
							bind:value={step.title}
							placeholder="A step, like Pack ID and pens"
							aria-label="Step {index + 1}"
							maxlength={200}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							class="size-11 shrink-0 md:size-8"
							aria-label="Remove step {index + 1}"
							onclick={() => (form.steps = form.steps.filter((_, at) => at !== index))}
							><X /></Button
						>
					</div>
				{/each}
				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={() => (form.steps = [...form.steps, { title: '', minutes: null }])}
					>
						<Plus />
						Add a step
					</Button>
					{#if tasker.settings.hasOpenaiKey}
						<Button type="button" variant="ghost" size="sm" disabled={suggesting} onclick={suggest}>
							{suggesting ? 'Thinking...' : 'Suggest steps'}
						</Button>
					{/if}
				</div>

				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={close}>Skip</Button>
					<Button type="button" disabled={empty || busy} onclick={add}>Add</Button>
				</Dialog.Footer>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
