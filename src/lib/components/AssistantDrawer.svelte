<script lang="ts">
	import { tick } from 'svelte';
	import { Mic, Send } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { sendMessage, undoChange } from '#lib/assistant.js';
	import { canRecord, finishRecording, startRecording } from '#lib/speech.js';
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

	const voice = tasker.voice;
	let micMessage = $state('');
	let pressed = false;

	async function sendHeard(text: string | null) {
		if (text) await sendMessage(text);
		else micMessage = 'Did not catch that';
	}

	// Push-to-talk: speaking lasts exactly as long as the button or Space is held
	async function press(event: Event) {
		event.preventDefault();
		if (pressed || chat.busy) return;
		pressed = true;
		micMessage = '';
		const limited = (text: string | null) => {
			pressed = false;
			void sendHeard(text);
		};
		if (!(await startRecording(limited))) micMessage = 'The microphone is not available';
	}

	async function release() {
		if (!pressed) return;
		pressed = false;
		try {
			await sendHeard(await finishRecording());
		} catch (e) {
			micMessage = e instanceof Error ? e.message : 'Could not understand the recording';
		}
	}

	// Keep the newest message in view
	$effect(() => {
		void chat.messages.length;
		void chat.busy;
		void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
	});
</script>

<Sheet.Root bind:open={chat.open}>
	<Sheet.Content side="right" class="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Assistant</Sheet.Title>
			<Sheet.Description
				>Ask it to add, move or clear tasks. Every change can be undone.</Sheet.Description
			>
		</Sheet.Header>

		<div bind:this={list} class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4" aria-live="polite">
			{#if !hasKey}
				<p class="text-muted-foreground">
					Add your OpenAI key in <a
						class="underline"
						href="/settings"
						onclick={() => (chat.open = false)}>Settings</a
					> to use the assistant.
				</p>
			{:else if chat.messages.length === 0}
				<p class="text-muted-foreground">
					Try: "Dinner with friends tonight at 19:30 for two hours".
				</p>
			{/if}

			{#each chat.messages as message, index (index)}
				<div class="flex flex-col gap-1 {message.role === 'user' ? 'items-end' : 'items-start'}">
					<div
						class="max-w-[90%] rounded-2xl px-3 py-2 whitespace-pre-wrap
							{message.role === 'user'
							? 'bg-primary text-primary-foreground'
							: message.error
								? 'bg-destructive/15 text-destructive'
								: 'bg-muted'}"
					>
						{message.content}
					</div>
					{#each message.changes ?? [] as change (change.id)}
						<div class="text-muted-foreground flex max-w-[90%] items-center gap-2 text-xs">
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
					if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) void submit(e);
				}}
			/>
			{#if canRecord()}
				<Button
					type="button"
					size="icon"
					variant={voice.recording ? 'default' : 'secondary'}
					aria-label="Hold to talk"
					title="Hold to talk"
					aria-pressed={voice.recording}
					disabled={!hasKey || chat.busy || voice.transcribing}
					onpointerdown={(e) => {
						e.currentTarget.setPointerCapture(e.pointerId);
						void press(e);
					}}
					onpointerup={release}
					onpointercancel={release}
					onkeydown={(e) => {
						if (e.key === ' ' && !e.repeat) void press(e);
					}}
					onkeyup={(e) => e.key === ' ' && release()}
					onclick={(e) => e.preventDefault()}
				>
					<Mic />
				</Button>
			{/if}
			<Button
				type="submit"
				size="icon"
				aria-label="Send"
				disabled={!hasKey || chat.busy || !draft.trim()}
			>
				<Send />
			</Button>
		</form>
		<p class="text-muted-foreground px-3 pb-3 text-sm" role="status" aria-live="polite">
			{#if voice.recording}Listening, release to send{:else if voice.transcribing}Understanding...{:else if micMessage}{micMessage}{/if}
		</p>
	</Sheet.Content>
</Sheet.Root>
