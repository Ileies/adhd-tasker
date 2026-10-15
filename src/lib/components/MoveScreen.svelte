<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import type { ExportedTask } from '#lib/core/export.js';
	import type { PlanSummary } from '#lib/core/merge.js';
	import { formatClock } from '#lib/format.js';
	import { chooseMove, type MoveChoice } from '#lib/move.js';
	import { deviceTimezone, formatDay, todayIn } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const { onCancel }: { onCancel: () => void } = $props();

	const comparison = $derived(tasker.move.comparison);
	const today = $derived(todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone()));

	let choice = $state<MoveChoice | null>(null);
	let saveKey = $state(false);
	let showClashes = $state(false);

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const sizeOf = (plan: PlanSummary) =>
		`${plural(plan.tasks, 'task')} over ${plural(plan.days, 'day')}, ${plural(plan.alarms, 'alarm')}`;
	const when = (task: ExportedTask) =>
		`${formatClock(task.startTime)} - ${formatClock(task.startTime + task.duration)}`;

	const OPTIONS: { id: MoveChoice; label: string; detail: string }[] = [
		{
			id: 'both',
			label: 'Keep both',
			detail:
				"Adds this device's plan to your account. Overlapping tasks stay, Now shows the one with the higher priority."
		},
		{
			id: 'account',
			label: "Keep my account's",
			detail: "This device's plan is not uploaded. It stays on this device, and you can export it."
		},
		{
			id: 'device',
			label: "Keep this device's",
			detail:
				"Replaces your account's plan from today on. The old plan can be restored for 30 days."
		}
	];
</script>

{#if comparison}
	<div class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6 px-6 py-10">
		<h1 class="text-3xl leading-tight font-bold md:text-4xl">Your account already has a plan.</h1>

		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-lg">
			<dt class="text-muted-foreground">This device</dt>
			<dd>{sizeOf(comparison.device)}</dd>
			<dt class="text-muted-foreground">Your account</dt>
			<dd>{sizeOf(comparison.account)}</dd>
		</dl>

		{#if comparison.clashes.length > 0}
			<div class="space-y-3">
				<p class="text-lg">
					Both plan the same time on {plural(comparison.clashes.length, 'day')}
					({plural(comparison.clashingTasks, 'task')}).
					<button
						type="button"
						class="cursor-pointer underline underline-offset-4"
						aria-expanded={showClashes}
						onclick={() => (showClashes = !showClashes)}
					>
						{showClashes ? 'Hide them' : 'Show them'}
					</button>
				</p>
				{#if showClashes}
					<ul class="max-h-72 space-y-4 overflow-auto rounded-lg border p-4">
						{#each comparison.clashes as day (day.date)}
							<li>
								<p class="font-medium">{formatDay(day.date, today)}</p>
								<div class="mt-1 grid grid-cols-2 gap-4 text-sm">
									<div>
										<p class="text-muted-foreground">This device</p>
										{#each day.device as task (task.startTime + task.title)}
											<p>{when(task)} {task.title}</p>
										{/each}
									</div>
									<div>
										<p class="text-muted-foreground">Your account</p>
										{#each day.account as task (task.startTime + task.title)}
											<p>{when(task)} {task.title}</p>
										{/each}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- No option is preselected, so continuing needs a choice -->
		<fieldset class="space-y-3">
			<legend class="sr-only">What to do with this device's plan</legend>
			{#each OPTIONS as option (option.id)}
				<label class="flex cursor-pointer items-start gap-3">
					<input
						type="radio"
						name="move"
						value={option.id}
						class="accent-primary mt-1.5 size-4 shrink-0"
						bind:group={choice}
					/>
					<span>
						<span class="text-lg font-medium">{option.label}</span>
						<span class="text-muted-foreground block">{option.detail}</span>
					</span>
				</label>
			{/each}
		</fieldset>

		{#if tasker.move.hasKey && choice !== 'account'}
			<label class="flex cursor-pointer items-center gap-3">
				<input type="checkbox" class="accent-primary size-4" bind:checked={saveKey} />
				<span>Also save my OpenAI key to my account</span>
			</label>
		{/if}

		{#if tasker.move.error}
			<p class="text-destructive" role="alert">{tasker.move.error}</p>
		{/if}

		<div class="flex flex-wrap gap-3">
			<Button
				size="lg"
				class="h-14 px-8 text-lg"
				disabled={!choice || tasker.move.busy}
				onclick={() => choice && chooseMove(choice, saveKey && choice !== 'account')}
			>
				{tasker.move.busy ? 'Moving' : 'Continue'}
			</Button>
			<Button
				size="lg"
				variant="outline"
				class="h-14 px-8 text-lg"
				disabled={tasker.move.busy}
				onclick={onCancel}
			>
				Cancel sign-in
			</Button>
		</div>
		<p class="text-muted-foreground">
			Nothing is changed until you continue. Cancel signs this device out again and leaves both
			plans as they are.
		</p>
	</div>
{/if}
