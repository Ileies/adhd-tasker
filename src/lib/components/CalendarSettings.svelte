<script lang="ts">
	import { onMount } from 'svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { describePreview, type CalendarOverview, type Preview } from '#lib/core/calendar.js';
	import { importCalendar, syncCalendar } from '#lib/calendar.js';
	import { formatClock } from '#lib/format.js';
	import { formatDay, deviceTimezone, todayIn } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let overview = $state<CalendarOverview | null>(null);
	let chosen = $state<string[]>([]);
	let preview = $state<Preview | null>(null);
	let showClashes = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const today = $derived(todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone()));
	const nameOf = (id: string) => overview?.calendars.find((c) => c.id === id)?.name ?? id;

	async function load() {
		error = null;
		try {
			overview = await tasker.backend.calendar.overview();
			if (overview.state.status === 'preview') chosen = overview.state.calendars;
			else if (chosen.length === 0)
				chosen = overview.calendars.filter((c) => c.primary).map((c) => c.id);
		} catch (failure) {
			error = failure instanceof Error ? failure.message : String(failure);
		}
	}
	onMount(() => void load());

	/** Runs one request with the busy state, the reason stays on the screen. */
	async function run(work: () => Promise<void>) {
		busy = true;
		error = null;
		try {
			await work();
		} catch (failure) {
			error = failure instanceof Error ? failure.message : String(failure);
		}
		busy = false;
	}

	const look = () =>
		run(async () => {
			preview = await tasker.backend.calendar.preview(chosen);
			showClashes = false;
		});

	const bringIn = (mode: 'all' | 'noClash') =>
		run(async () => {
			const failure = await importCalendar(mode);
			if (failure) throw new Error(failure);
			preview = null;
			await load();
		});

	const stop = () =>
		run(async () => {
			await tasker.backend.calendar.stop();
			preview = null;
			await load();
		});

	const syncNow = () =>
		run(async () => {
			await tasker.backend.calendar.sync();
			await syncCalendar();
			await load();
		});

	const when = (start: number, duration: number) =>
		`${formatClock(start)} - ${formatClock(start + duration)}`;
</script>

<div class="space-y-4">
	<h3 class="font-medium">Calendar</h3>

	{#if error}
		<p class="text-destructive text-sm" role="alert">{error}</p>
	{/if}

	{#if !overview}
		<p class="text-muted-foreground text-sm">Reading your calendars</p>
	{:else if overview.state.status === 'active'}
		<p class="text-sm">
			Following {overview.state.calendars.map(nameOf).join(', ')}. Events of the next 14 days are
			tasks in your plan, all-day events show on Plan.
			{#if overview.state.syncedAt}
				Last read at {formatClock(
					new Date(overview.state.syncedAt).getHours() * 60 +
						new Date(overview.state.syncedAt).getMinutes()
				)}.
			{/if}
		</p>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" disabled={busy} onclick={syncNow}>Read now</Button>
			<Button variant="ghost" disabled={busy} onclick={stop}>Stop following</Button>
		</div>
		<p class="text-muted-foreground text-sm">
			Your Google Calendar is only read, nothing there is changed. Stopping keeps the tasks already
			in your plan.
		</p>
	{:else if preview}
		<!-- The first look: nothing is written to the plan or to Google until a choice below -->
		<p class="text-base">{describePreview(preview)}</p>
		{#if preview.clashes.length > 0}
			<p class="text-sm">
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
				<ul class="max-h-64 space-y-3 overflow-auto rounded-lg border p-3 text-sm">
					{#each preview.clashes as clash (clash.date + clash.event.startTime + clash.event.title)}
						<li>
							<p class="font-medium">{formatDay(clash.date, today)}</p>
							<p>{when(clash.event.startTime, clash.event.duration)} {clash.event.title}</p>
							{#each clash.tasks as task (task.startTime + task.title)}
								<p class="text-muted-foreground">
									{when(task.startTime, task.duration)}
									{task.title} (your plan)
								</p>
							{/each}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button disabled={busy} onclick={() => bringIn('all')}>Import all</Button>
			{#if preview.clashing > 0}
				<Button variant="outline" disabled={busy} onclick={() => bringIn('noClash')}
					>Import only what does not clash</Button
				>
			{/if}
			<!-- Cancelling revokes the grant at Google and deletes the stored token -->
			<form method="POST" action="/settings?/unlinkGoogle">
				<Button type="submit" variant="ghost" disabled={busy}>Cancel linking</Button>
			</form>
		</div>
		<p class="text-muted-foreground text-sm">
			Overlapping events stay and Now shows the one with the higher priority. Nothing in your plan
			or in Google changes before you choose.
		</p>
	{:else}
		<fieldset class="space-y-2">
			<legend class="text-muted-foreground text-sm">Which calendars should the plan follow?</legend>
			{#each overview.calendars as calendar (calendar.id)}
				<label class="flex cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						class="accent-primary size-4"
						value={calendar.id}
						checked={chosen.includes(calendar.id)}
						onchange={(e) =>
							(chosen = e.currentTarget.checked
								? [...chosen, calendar.id]
								: chosen.filter((id) => id !== calendar.id))}
					/>
					<span>{calendar.name}</span>
				</label>
			{/each}
		</fieldset>
		<Button disabled={busy || chosen.length === 0} onclick={look}>Look at what is coming</Button>
		<p class="text-muted-foreground text-sm">
			This only looks. You choose what to import on the next screen.
		</p>
	{/if}
</div>
