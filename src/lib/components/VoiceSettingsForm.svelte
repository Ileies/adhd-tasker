<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';

	const { replies }: { replies: boolean } = $props();

	let message = $state<string | null>(null);
	let saved = $state(false);

	async function save(event: Event) {
		saved = false;
		const checked = (event.target as HTMLInputElement).checked;
		message = await saveSettings({ ok: true, value: { voiceReplies: checked } });
		saved = message === null;
	}
</script>

<div class="space-y-4">
	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			class="accent-primary mt-1 size-4 shrink-0"
			checked={replies}
			onchange={save}
		/>
		<span class="font-medium">Speak replies and notes</span>
	</label>
	<p class="text-muted-foreground text-sm">
		Recordings and spoken text go to OpenAI with your key and are not kept.
	</p>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}
</div>
