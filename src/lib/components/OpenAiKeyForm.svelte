<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const { hasKey, message }: { hasKey: boolean; message?: string } = $props();

	let busy = $state(false);
</script>

<div class="space-y-3">
	<p class="text-sm">
		{#if hasKey}
			A key is saved. It is stored encrypted and never shown again.
		{:else}
			No key saved. The assistant stays off, everything else works without it.
		{/if}
	</p>

	<form
		method="POST"
		action="?/saveOpenaiKey"
		class="flex gap-2"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<Input
			type="password"
			name="key"
			autocomplete="off"
			placeholder={hasKey ? 'Paste a new key to replace it' : 'sk-...'}
			aria-label="OpenAI API key"
		/>
		<Button type="submit" disabled={busy}>{busy ? 'Checking' : 'Save'}</Button>
	</form>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}

	{#if hasKey}
		<form method="POST" action="?/removeOpenaiKey" use:enhance>
			<Button type="submit" variant="ghost" size="sm">Remove key</Button>
		</form>
	{/if}

	<p class="text-muted-foreground text-sm">
		Replies use OpenAI's flex processing and nothing is stored on OpenAI's side, so an answer can
		take a little longer. Your messages and the tasks of today and tomorrow are sent to OpenAI with
		your own key whenever you talk to the assistant. Nothing is sent otherwise.
	</p>
</div>
