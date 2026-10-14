<script lang="ts">
	import { saveKey, removeKey } from '#lib/openai-key.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const { hasKey, signedIn }: { hasKey: boolean; signedIn: boolean } = $props();

	let busy = $state(false);
	let message = $state<string | null>(null);
	let key = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = await saveKey(key);
		if (message === null) key = '';
		busy = false;
	}
</script>

<div class="space-y-3">
	<p class="text-sm">
		{#if hasKey}
			A key is saved. {signedIn
				? 'It is stored encrypted on the server and never shown again.'
				: 'It stays in this browser and is never shown again.'}
		{:else}
			No key saved. The assistant stays off, everything else works without it.
		{/if}
	</p>

	<form class="flex gap-2" onsubmit={save}>
		<Input
			type="password"
			name="key"
			autocomplete="off"
			placeholder={hasKey ? 'Paste a new key to replace it' : 'sk-...'}
			aria-label="OpenAI API key"
			bind:value={key}
		/>
		<Button type="submit" disabled={busy}>{busy ? 'Checking' : 'Save'}</Button>
	</form>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}

	{#if hasKey}
		<Button variant="ghost" size="sm" onclick={removeKey}>Remove key</Button>
	{/if}

	<p class="text-muted-foreground text-sm">
		Replies use OpenAI's flex processing and nothing is stored on OpenAI's side, so an answer can
		take a little longer. Your messages and the tasks of today and tomorrow are sent to OpenAI with
		your own key whenever you talk to the assistant. Nothing is sent otherwise.
		{#if !signedIn}
			Without an account the key is only used by this browser, it never reaches this server.
		{/if}
	</p>
</div>
