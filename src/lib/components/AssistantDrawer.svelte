<script lang="ts">
	import { tick } from 'svelte';
	import { Send } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { sendMessage, undoChange } from '#lib/assistant.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	const { hasKey }: { hasKey: boolean } = $props();

	let draft = $state('');
	let list: HTMLDivElement | undefined = $state();
	const chat = tasker.assistant;

	async function submit(event?: Event) {
		event?.preventDefault();
		const text = draft;
		if (!text.trim() || chat.busy) return;
		draft = '';
		await sendMessage(text);
	}

	// Keep the newest message in view
	$effect(() => {
		chat.messages.length;
		chat.busy;
		tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
	});
</script>

<Sheet.Root bind:open={chat.open}>
	<Sheet.Content side="right" class="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Assistant</Sheet.Title>
			<Sheet.Description>Ask it to add, move or clear tasks. Every change can be undone.</Sheet.Description>
		</Sheet.Header>

		<div bind:this={list} class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4" aria-live="polite">
			{#if !hasKey}
				<p class="text-muted-foreground">
					Add your OpenAI key in <a class="underline" href="/settings" onclick={() => (chat.open = false)}>Settings</a> to use the assistant.
				</p>
			{:else if chat.messages.length === 0}
				<p class="text-muted-foreground">Try: "Dinner with friends tonight at 19:30 for two hours".</p>
			{/if}

			{#each chat.messages as message, index (index)}
				<div class="flex flex-col gap-1 {message.role === 'user' ? 'items-end' : 'items-start'}">
					<div
						class="max-w-[90%] rounded-2xl px-3 py-2 whitespace-pre-wrap
							{message.role === 'user' ? 'bg-primary text-primary-foreground' : message.error ? 'bg-destructive/15 text-destructive' : 'bg-muted'}"
					>
						{message.content}
					</div>
					{#each message.changes ?? [] as change (change.id)}
						<div class="flex max-w-[90%] items-center gap-2 text-xs text-muted-foreground">
							<span class={change.undone ? 'line-through' : ''}>{change.summary}</span>
							{#if change.undone}
								<span>undone</span>
							{:else}
								<Button variant="ghost" size="xs" onclick={() => undoChange(change)}>Undo</Button>
							{/if}
						</div>
					{/each}
				</div>
			{/each}

			{#if chat.busy}
				<p class="text-muted-foreground">Thinking...</p>
			{/if}
		</div>

		<form class="flex items-end gap-2 border-t p-3" onsubmit={submit}>
			<Textarea
				bind:value={draft}
				rows={2}
				class="resize-none"
				placeholder="Message"
				aria-label="Message the assistant"
				disabled={!hasKey}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) submit(e);
				}}
			/>
			<Button type="submit" size="icon" aria-label="Send" disabled={!hasKey || chat.busy || !draft.trim()}>
				<Send />
			</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
