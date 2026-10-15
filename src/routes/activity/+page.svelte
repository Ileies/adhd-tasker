<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { effectiveClock12h } from '#lib/format.js';
	import { tasker } from '#lib/app.svelte.js';
	import { loadSchedule, removeEntry } from '#lib/alarms.js';
	import { undoChange } from '#lib/assistant.js';
	import { groupByDay } from '#lib/activityview.js';
	import type { ActivityView } from '#lib/core/activity.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import PageFrame from '#lib/components/PageFrame.svelte';

	const { data } = $props();

	// An account's server sends the first view, a guest's device is asked once the page is open
	const EMPTY: ActivityView = { tokensToday: 0, dailyTokenBudget: null, actions: [], events: [] };
	let view = $state<ActivityView | null>(untrack(() => data.activity));
	const shown = $derived(view ?? EMPTY);

	async function refresh() {
		try {
			view = await tasker.backend.activity.load();
		} catch {
			// the list stays as it was
		}
	}

	onMount(() => {
		if (!view) void refresh();
		void loadSchedule().catch(() => {});
	});

	const sections = $derived([
		{ id: 'changes', label: 'Changes' },
		{ id: 'checkins', label: 'Planned check-ins' },
		{ id: 'events', label: 'Event log' }
	]);

	const timezone = $derived(tasker.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
	const clock = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: effectiveClock12h(tasker.settings.clock12h) ? 'numeric' : '2-digit',
			minute: '2-digit',
			hourCycle: effectiveClock12h(tasker.settings.clock12h) ? 'h12' : 'h23',
			timeZone: timezone
		})
	);
	const dayClock = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: effectiveClock12h(tasker.settings.clock12h) ? 'numeric' : '2-digit',
			minute: '2-digit',
			hourCycle: effectiveClock12h(tasker.settings.clock12h) ? 'h12' : 'h23',
			day: 'numeric',
			month: 'short',
			timeZone: timezone
		})
	);

	const days = $derived(groupByDay(shown.actions, Date.now(), timezone));

	async function undo(action: ActivityView['actions'][number]) {
		await undoChange({ id: action.id, summary: action.summary, dates: action.dates });
		await refresh();
	}
</script>

<svelte:head>
	<title>Assistant activity - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Assistant activity" {sections}>
	<Card.Root id="changes" class="scroll-mt-6">
		<Card.Header>
			<Card.Title>Changes</Card.Title>
			<Card.Description
				>Every edit it made, with its reason. Undo puts the task back.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-5">
			{#if days.length === 0}
				<p class="text-muted-foreground">Nothing yet.</p>
			{/if}
			{#each days as day (day.date)}
				<section aria-label={day.title} class="space-y-2">
					<h2 class="text-muted-foreground text-sm font-medium">{day.title}</h2>
					<ul class="flex flex-col gap-3">
						{#each day.items as action (action.id)}
							<li class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<div
										class="break-words {action.undone ? 'text-muted-foreground line-through' : ''}"
									>
										{action.summary}
									</div>
									{#if action.reason}<div class="text-muted-foreground text-sm">
											Because: {action.reason}
										</div>{/if}
									<div class="text-muted-foreground text-xs">
										{clock.format(action.at)}, {action.onItsOwn
											? 'on its own'
											: 'asked in the chat'}
									</div>
								</div>
								{#if action.undone}
									<span class="text-muted-foreground shrink-0 text-sm">undone</span>
								{:else}
									<Button size="sm" variant="secondary" onclick={() => undo(action)}>Undo</Button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root id="checkins" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Planned check-ins</Card.Title>
			<Card.Description
				>Times the assistant chose to look at your plan again. Nothing rings, it only reacts within
				its usual limits.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if tasker.schedule.wakeups.length === 0}
				<p class="text-muted-foreground">None planned.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each tasker.schedule.wakeups as wakeup (wakeup.id)}
						<li class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="break-words">{wakeup.note}</div>
								<div class="text-muted-foreground text-sm">{dayClock.format(wakeup.fireAt)}</div>
							</div>
							<Button variant="ghost" size="sm" onclick={() => removeEntry(wakeup.id)}
								>Cancel</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root id="events" class="mt-4 scroll-mt-6">
		<Card.Content>
			<!-- Diagnostic, so it stays folded until someone wants to know why the assistant did or did not act -->
			<details>
				<summary class="cursor-pointer py-1 font-medium">Event log ({shown.events.length})</summary>
				<p class="text-muted-foreground py-2 text-sm">
					What happened in your plan and what became of it. Most events are only logged.
				</p>
				{#if shown.events.length === 0}
					<p class="text-muted-foreground">Nothing yet.</p>
				{:else}
					<ul class="flex flex-col gap-3">
						{#each shown.events as event (event.id)}
							<li>
								<div class="break-words">{event.line}</div>
								<div class="text-muted-foreground text-xs">
									{dayClock.format(event.at)}, {event.origin}{event.outcome
										? `, ${event.outcome}`
										: ', waiting'}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</details>
		</Card.Content>
	</Card.Root>

	<p class="text-muted-foreground mt-4 text-sm">
		Tokens used today: {shown.tokensToday.toLocaleString()}{shown.dailyTokenBudget
			? ` of ${shown.dailyTokenBudget.toLocaleString()} for unprompted reactions`
			: ''}.
	</p>
</PageFrame>
