<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { tasker } from '#lib/app.svelte.js';
	import { undoChange } from '#lib/assistant.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';

	const { data } = $props();

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

	async function undo(action: (typeof data.actions)[number]) {
		await undoChange({ id: action.id, summary: action.summary, dates: action.dates });
		await refreshAll();
	}
</script>

<svelte:head>
	<title>Activity - ADHD Tasker</title>
</svelte:head>

<div class="mx-auto max-w-2xl p-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Changes by the assistant</Card.Title>
			<Card.Description>
				Every edit it made, with its reason. Undo puts the task back. Used today: {data.tokensToday.toLocaleString()}
				tokens{data.dailyTokenBudget
					? ` of ${data.dailyTokenBudget.toLocaleString()} for unprompted reactions`
					: ''}.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.actions.length === 0}
				<p class="text-muted-foreground">Nothing yet.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each data.actions as action (action.id)}
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

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Events it saw</Card.Title>
			<Card.Description
				>What happened in your plan and what became of it. Most events are only logged.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if data.events.length === 0}
				<p class="text-muted-foreground">Nothing yet.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each data.events as event (event.id)}
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
</div>
