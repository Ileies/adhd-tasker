<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { undoChange } from '#lib/assistant.js';
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
	});

	const sections = [
		{ id: 'changes', label: 'Changes' },
		{ id: 'events', label: 'Events it saw' }
	];

	const clock = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			day: 'numeric',
			month: 'short',
			timeZone: tasker.timezone ?? undefined
		})
	);
	const when = (at: number) => clock.format(at);

	async function undo(action: ActivityView['actions'][number]) {
		await undoChange({ id: action.id, summary: action.summary, dates: action.dates });
		await refresh();
	}
</script>

<svelte:head>
	<title>Activity - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Activity" {sections}>
	<Card.Root id="changes" class="scroll-mt-6">
		<Card.Header>
			<Card.Title>Changes by the assistant</Card.Title>
			<Card.Description>
				Every edit it made, with its reason. Undo puts the task back. Used today: {shown.tokensToday.toLocaleString()}
				tokens{shown.dailyTokenBudget
					? ` of ${shown.dailyTokenBudget.toLocaleString()} for unprompted reactions`
					: ''}.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if shown.actions.length === 0}
				<p class="text-muted-foreground">Nothing yet.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each shown.actions as action (action.id)}
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
									{when(action.at)}, {action.onItsOwn ? 'on its own' : 'asked in the chat'}
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
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root id="events" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Events it saw</Card.Title>
			<Card.Description
				>What happened in your plan and what became of it. Most events are only logged.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if shown.events.length === 0}
				<p class="text-muted-foreground">Nothing yet.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each shown.events as event (event.id)}
						<li>
							<div class="break-words">{event.line}</div>
							<div class="text-muted-foreground text-xs">
								{when(event.at)}, {event.origin}{event.outcome ? `, ${event.outcome}` : ', waiting'}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</PageFrame>
