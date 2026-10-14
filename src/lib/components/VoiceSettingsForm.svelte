<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';

	const { replies, saved }: { replies: boolean; saved?: boolean } = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/saveVoice"
	class="space-y-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			name="replies"
			class="accent-primary mt-1 size-4 shrink-0"
			checked={replies}
		/>
		<span>
			<span class="font-medium">Speak replies and notes</span>
			<span class="text-muted-foreground block text-sm">
				Replies in the chat are read aloud in a short form. Notes the assistant puts on the Now
				screen are spoken only on the display device. Muting silences it.
			</span>
		</span>
	</label>
	<p class="text-muted-foreground text-sm">
		Talking works in the assistant: hold the microphone button (or Space on it) and release to send.
		Recordings and spoken text go to OpenAI with your key and are not kept.
	</p>

	{#if saved}<p class="text-success text-sm" role="status">Saved.</p>{/if}

	<Button type="submit" disabled={busy}>Save</Button>
</form>
